"""New owned MySQL only. Bootstrap is mysqld init-file, never an admin test connection."""
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.parse import urlencode, urlunsplit

class Lab:
    def __init__(self, parent, base, version, repo, node, age):
        self.root=Path(tempfile.mkdtemp(prefix='mysql-',dir=parent)); self.root.chmod(0o700)
        self.base=Path(base); self.version=version; self.repo=Path(repo); self.node=node; self.age=age
        self.runid=secrets.token_hex(6); self.schema='tf_oci_'+self.runid+'_test'; self.process=None
        self.port=0; self.credentials={}; self.env={'PATH':str(Path(node).parent)+':/usr/bin:/bin','HOME':str(self.root),'LANG':'C.UTF-8','TZ':'UTC'}
        for name in ('workspace','backups','state','storage','private'): (self.root/name).mkdir(mode=0o700)
    def command(self,args,input=None,timeout=120,env=None):
        p=subprocess.run([str(a) for a in args],input=input,capture_output=True,env=env or self.env,timeout=timeout)
        if p.returncode: raise RuntimeError('LAB_TOOL_FAILED_'+Path(args[0]).name)
        return p.stdout
    def start(self):
        openssl=shutil.which('openssl')
        self.command([openssl,'req','-x509','-newkey','rsa:2048','-nodes','-keyout',self.root/'private/ca.key','-out',self.root/'ca.pem','-days','2','-subj','/CN=TraceFlow synthetic OCI06 CA'])
        self.command([openssl,'req','-newkey','rsa:2048','-nodes','-keyout',self.root/'private/server.key','-out',self.root/'private/server.csr','-subj','/CN=localhost'])
        (self.root/'private/extensions').write_text('subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n')
        self.command([openssl,'x509','-req','-in',self.root/'private/server.csr','-CA',self.root/'ca.pem','-CAkey',self.root/'private/ca.key','-CAcreateserial','-out',self.root/'server.pem','-days','2','-extfile',self.root/'private/extensions'])
        for p in (self.root/'private').iterdir(): p.chmod(0o600)
        self.command([self.base/'bin/mysqld','--no-defaults','--basedir='+str(self.base),'--datadir='+str(self.root/'data'),'--initialize-insecure','--mysqlx=OFF'],timeout=90)
        for _ in range(100):
            candidate=49152+secrets.randbelow(16384)
            with socket.socket() as s:
                try:s.bind(('127.0.0.1',candidate))
                except OSError:continue
                self.port=candidate;break
        if not self.port:raise RuntimeError('NO_FREE_DISPOSABLE_PORT')
        bootstrap=["ALTER USER 'root'@'localhost' IDENTIFIED BY '"+secrets.token_hex(32)+"';",'CREATE DATABASE `'+self.schema+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;']
        privileges={'migration':'SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES','runtime':'SELECT, INSERT, UPDATE, DELETE','backup':'SELECT, SHOW VIEW','diagnostic':'SELECT'}
        for role,rights in privileges.items():
            user='tf06_'+role+'_'+self.runid; password=secrets.token_hex(32)
            self.credentials[role]=(user,password)
            bootstrap.extend(["CREATE USER '"+user+"'@'127.0.0.1' IDENTIFIED BY '"+password+"' REQUIRE SSL;",
                              'GRANT '+rights+' ON `'+(self.schema if role=='diagnostic' else 'tf\\_oci\\_'+self.runid+'\\_%')+'`.* TO \''+user+"'@'127.0.0.1';"])
        init=self.root/'private/init.sql'; init.write_text('\n'.join(bootstrap)); init.chmod(0o600)
        self.args=[str(self.base/'bin/mysqld'),'--no-defaults','--basedir='+str(self.base),'--datadir='+str(self.root/'data'),
            '--bind-address=127.0.0.1','--port='+str(self.port),'--mysqlx=OFF','--skip-name-resolve','--skip-log-bin',
            '--max-connections=32','--innodb-buffer-pool-size=134217728','--default-time-zone=+00:00',
            '--socket='+str(self.root/'mysql.sock'),'--pid-file='+str(self.root/'mysql.pid'),'--log-error='+str(self.root/'private/mysql.log'),
            '--ssl-ca='+str(self.root/'ca.pem'),'--ssl-cert='+str(self.root/'server.pem'),'--ssl-key='+str(self.root/'private/server.key'),
            '--require-secure-transport=ON']
        self.process=subprocess.Popen(self.args+['--init-file='+str(init)],env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        self.wait_ready(); init.unlink()
        identity=json.loads(self.sql('migration',"SELECT JSON_OBJECT('uuid',@@server_uuid,'datadir',@@datadir,'port',@@port,'version',VERSION(),'db',DATABASE())").decode())
        assert identity['db']==self.schema and identity['port']==self.port and identity['version']==self.version and identity['datadir'].rstrip('/')==str(self.root/'data')
        self.uuid=identity['uuid']
        self.write_json(self.root/'.traceflow-dr-lab.json',{'task':'OCI-DEPLOY-06','runId':self.runid,'serverUuid':self.uuid,'datadir':str(self.root/'data'),'port':self.port})
        self.write_json(self.root/'private/context.json',{'root':str(self.root),'base':str(self.base),'version':self.version,'runid':self.runid,'schema':self.schema,'port':self.port,'uuid':self.uuid,'pid':self.process.pid,'credentials':self.credentials,'args':self.args})
        return self
    @staticmethod
    def write_json(path,value): path.write_text(json.dumps(value,indent=2)); path.chmod(0o600)
    def url(self,role='migration',schema=None,tls=True):
        user,password=self.credentials[role]
        query=urlencode({'sslaccept':'strict','sslcert':str(self.root/'ca.pem'),'connection_limit':'1','connect_timeout':'5','pool_timeout':'5','socket_timeout':'10'}) if tls else ''
        return urlunsplit(('mysql',user+':'+password+'@127.0.0.1:'+str(self.port),'/' +(schema or self.schema),query,''))
    def sql(self,role,sql,schema=None,timeout=15):
        user,password=self.credentials[role]
        options=self.root/'private'/('client-'+role+'.cnf')
        options.write_text('[client]\nuser='+user+'\npassword='+password+'\nhost=127.0.0.1\nport='+str(self.port)+'\n'); options.chmod(0o600)
        try:
            return self.command([self.base/'bin/mysql','--defaults-file='+str(options),'--no-login-paths','--protocol=TCP','--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+str(self.root/'ca.pem'),'--connect-timeout=2','--batch','--raw','--skip-column-names',schema or self.schema],input=(sql+';\n').encode(),timeout=timeout)
        finally: options.unlink(missing_ok=True)
    def wait_ready(self):
        until=time.monotonic()+45
        while time.monotonic()<until:
            if self.process.poll() is not None: raise RuntimeError('OWNED_MYSQL_EXITED')
            try: self.sql('migration','SELECT 1'); return
            except RuntimeError: time.sleep(.2)
        raise RuntimeError('OWNED_MYSQL_TIMEOUT')
    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try: self.process.wait(30)
            except subprocess.TimeoutExpired: self.process.kill(); self.process.wait()
    def restart(self):
        self.stop(); self.process=subprocess.Popen(self.args,env=self.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); self.wait_ready()
    def cleanup(self):
        self.stop()
        # Only an exact root allocated by this object; never a user's schema or shared instance.
        assert self.root.name.startswith('mysql-') and not self.root.is_symlink()
        shutil.rmtree(self.root)
