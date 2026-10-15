#!/usr/bin/env python3
"""Disposable TLS/Prisma failure laboratory. Never accepts an external database URL."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit, parse_qs, urlencode, urlunsplit
sys.dont_write_bytecode=True
from persistence_lab import Lab

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('mysql-base','version','node','report'):p.add_argument('--'+name,required=True)
    a=p.parse_args();assert a.version in ('8.4.8','26.7.0');os.umask(0o077)
    repo=Path(__file__).resolve().parents[2];root=Path(tempfile.mkdtemp(prefix='tf06-connection-',dir='/private/tmp' if sys.platform=='darwin' else '/tmp')).resolve()
    lab=Lab(root,a.mysql_base,a.version,repo,a.node,None);report={'mode':'LOCAL_ISOLATED','version':a.version,'checks':[]}
    try:
        lab.start()
        backend=root/'backend';backend.mkdir()
        for name in ('scripts','src'):shutil.copytree(repo/'backend'/name,backend/name)
        shutil.copyfile(repo/'backend/package.json',backend/'package.json')
        shutil.copyfile(repo/'deploy/tests/connection-probes.mjs',backend/'connection-probes.mjs')
        (backend/'node_modules').symlink_to(repo/'backend/node_modules')
        auth={'formatVersion':1,'operation':'diagnose-read-only','mode':'local-isolated','expiresAt':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=1)).isoformat(),
              'target':{'host':'127.0.0.1','port':lab.port,'schema':lab.schema,'user':lab.credentials['diagnostic'][0],'serverUuid':lab.uuid,'version':a.version,'datadir':str(lab.root/'data')}}
        authorization=root/'authorization.json';Lab.write_json(authorization,auth)
        identity=root/'identity.json';Lab.write_json(identity,dict(auth['target'],mode='local-isolated'))
        env=dict(lab.env,TEST_DATABASE_URL=lab.url('diagnostic'),TF06_IDENTITY=str(identity))
        def child(args,expected_code=0,environment=None):
            r=subprocess.run([a.node,*args],cwd=backend,env=environment or env,capture_output=True,timeout=45)
            if r.returncode!=expected_code:raise RuntimeError('PROBE_UNEXPECTED_EXIT_'+str(r.returncode))
            return json.loads(r.stdout)
        def diagnostic():return child(['scripts/validate-oci-heatwave-connection.js','--authorization',str(authorization)])
        report['checks'].append({'name':'strict-read-only-diagnostic','result':diagnostic()})
        report['checks'].append({'name':'authentication-pool-timeouts','result':child(['connection-probes.mjs'])})
        original=(lab.root/'server.pem').read_bytes()
        for kind in ('unknown-ca','wrong-identity','expired'):
            environment=dict(env)
            if kind=='unknown-ca':
                alternate=root/'other-ca.pem'
                lab.command(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',root/'other.key','-out',alternate,'-days','1','-subj','/CN=Other synthetic CA'])
                u=urlsplit(env['TEST_DATABASE_URL']);q=parse_qs(u.query);q['sslcert']=[str(alternate)]
                environment['TEST_DATABASE_URL']=urlunsplit((u.scheme,u.netloc,u.path,urlencode(q,doseq=True),''))
            else:
                lab.stop()
                ext=root/'server.ext';ext.write_text('subjectAltName=IP:'+('127.0.0.2' if kind=='wrong-identity' else '127.0.0.1')+'\nextendedKeyUsage=serverAuth\n')
                if kind=='wrong-identity':
                    lab.command(['openssl','x509','-req','-in',lab.root/'private/server.csr','-CA',lab.root/'ca.pem','-CAkey',lab.root/'private/ca.key','-CAcreateserial','-out',lab.root/'server.pem','-days','1','-extfile',ext])
                else:
                    (root/'index.txt').write_text('');(root/'serial').write_text('1000\n')
                    config=root/'ca.cnf';config.write_text('[ca]\ndefault_ca=local\n[local]\ndatabase='+str(root/'index.txt')+'\nserial='+str(root/'serial')+'\nnew_certs_dir='+str(root)+'\ncertificate='+str(lab.root/'ca.pem')+'\nprivate_key='+str(lab.root/'private/ca.key')+'\ndefault_md=sha256\ndefault_days=1\npolicy=policy\n[policy]\ncommonName=supplied\n')
                    lab.command(['openssl','ca','-batch','-notext','-config',config,'-in',lab.root/'private/server.csr','-out',lab.root/'server.pem','-startdate','20200101000000Z','-enddate','20200102000000Z','-extfile',ext])
                lab.process=subprocess.Popen(lab.args,env=lab.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                deadline=time.monotonic()+30
                while True:
                    if lab.process.poll() is not None:raise RuntimeError('OWNED_SERVER_EXITED')
                    try:
                        with socket.create_connection(('127.0.0.1',lab.port),timeout=.2):break
                    except OSError:
                        if time.monotonic()>deadline:raise RuntimeError('OWNED_SERVER_TIMEOUT')
                        time.sleep(.1)
            diag=child(['scripts/validate-oci-heatwave-connection.js','--authorization',str(authorization)],1,environment)
            assert diag['status']=='FAIL' and diag['code'] not in ('TLS_TIMEOUT','DIAGNOSTIC_FAILED')
            prisma=child(['connection-probes.mjs','connect-failure'],environment=environment)
            assert prisma['code']=='P1011'
            report['checks'].append({'name':kind,'diagnostic':diag,'prisma':prisma})
        lab.stop();(lab.root/'server.pem').write_bytes(original);lab.restart()
        report['checks'].append({'name':'recovery-after-certificate-replacement','result':diagnostic()})
        lab.stop()
        report['checks'].append({'name':'inaccessible-port','result':child(['connection-probes.mjs','connect-failure'])})
        report['status']='PASS';report['productionCertified']=False
    except Exception as e:
        report['status']='FAIL';report['code']=type(e).__name__+':'+str(e);raise
    finally:
        lab.cleanup();shutil.rmtree(root)
        report['cleanedUp']=True
        Path(a.report).write_text(json.dumps(report,indent=2));print(json.dumps({'status':report['status'],'report':a.report}),flush=True)
if __name__=='__main__':main()
