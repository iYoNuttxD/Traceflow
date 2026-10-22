#!/usr/bin/env python3
"""Explicit local experiment: own mysqld, synthetic accounts, no existing DB or migrations reset."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import select
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone, timedelta
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'deploy/tests'))
sys.path.insert(0,str(ROOT/'deploy/lib'))
from persistence_lab import Lab
from release_contract import schema_contract, file_digest

class OwnedLab(Lab):
    def wait_ready(self):
        deadline=time.monotonic()+45
        while time.monotonic()<deadline:
            if self.process.poll() is not None:raise RuntimeError('LAB_SERVER_EXITED')
            r=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',str(self.process.pid),'-iTCP:'+str(self.port),'-sTCP:LISTEN'],capture_output=True,env=self.env)
            if r.returncode==0:
                assert ('127.0.0.1:'+str(self.port)).encode() in r.stdout and b'*:' not in r.stdout
                init=self.root/'private/init.sql'
                if init.exists():
                    match=re.search(r"ALTER USER 'root'@'localhost' IDENTIFIED BY '([a-f0-9]{64})'",init.read_text());assert match
                    self.root_password=match[1]
                try:self.sql('migration','SELECT 1');return
                except RuntimeError:pass
            time.sleep(.1)
        raise RuntimeError('OWNED_LAB_READY_TIMEOUT')
    def root_sql(self,sql,database=None):
        assert self.process.poll() is None and self.root.name.startswith('mysql-')
        file=self.root/'private/root-client.cnf'
        file.write_text('[client]\nuser=root\npassword='+self.root_password+'\n');file.chmod(0o600)
        try:return self.command([self.base/'bin/mysql','--defaults-file='+str(file),'--no-login-paths','--protocol=SOCKET','--socket='+str(self.root/'mysql.sock'),'--skip-reconnect','--batch','--raw','--skip-column-names',database or self.schema],input=(sql+';\n').encode(),timeout=30)
        finally:file.unlink()
    def release_accounts(self):
        owner=self.schema.replace('_test','_owner');self.owner_token=secrets.token_hex(32)
        sql=['CREATE DATABASE `'+owner+'`','CREATE TABLE `'+owner+'`.RunOwner (id INT PRIMARY KEY, token VARCHAR(64) NOT NULL)',"INSERT INTO `"+owner+"`.RunOwner VALUES(1,'"+self.owner_token+"')"]
        rights={'migration':'SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES','runtime':'SELECT, INSERT, UPDATE, DELETE','inspector':'SELECT, EVENT, TRIGGER, SHOW_ROUTINE'}
        for role,privileges in rights.items():
            user='tf07_'+role+'_'+self.runid;password=secrets.token_hex(32);self.credentials[role]=(user,password)
            sql.append("CREATE USER '"+user+"'@'127.0.0.1' IDENTIFIED BY '"+password+"' REQUIRE SSL")
            if role=='inspector':sql.append("GRANT "+privileges+" ON *.* TO '"+user+"'@'127.0.0.1'")
            else:
                sql.extend(["GRANT "+privileges+" ON `"+self.schema+"`.* TO '"+user+"'@'127.0.0.1'","GRANT SELECT ON `"+owner+"`.* TO '"+user+"'@'127.0.0.1'"])
        self.root_sql(';\n'.join(sql))
        tz=Path('/usr/share/zoneinfo/UTC');assert tz.is_file()
        tzsql=self.command([self.base/'bin/mysql_tzinfo_to_sql',tz,'UTC'])
        self.root_sql(tzsql.decode(),'mysql')
        self.args=[a for a in self.args if not a.startswith('--default-time-zone=')]
        self.args+=['--default-time-zone=UTC','--partial-revokes=ON','--mandatory-roles=public','--activate-all-roles-on-login=OFF']
        self.restart()

class Bridge:
    def __init__(self,lab,runtime,admin,auth,mode='migrate'):
        env=dict(lab.env,TF_RELEASE_LAB_TOKEN=lab.owner_token,TEST_DATABASE_URL=lab.url('migration'),TEST_RUNTIME_DATABASE_URL=lab.url('runtime'),CHECKPOINT_DISABLE='1',PRISMA_HIDE_UPDATE_MESSAGE='1')
        self.lab=lab
        self.p=subprocess.Popen([lab.node,str(ROOT/'deploy/scripts/release-database.mjs'),str(runtime),str(admin),str(auth),mode],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1,env=env,cwd=lab.root)
        self.ready=self.read(30)
    def read(self,timeout=40):
        assert select.select([self.p.stdout],[],[],timeout)[0],'LAB_BRIDGE_TIMEOUT'
        line=self.p.stdout.readline();assert line,'LAB_BRIDGE_EXITED'
        for _,password in self.lab.credentials.values():assert password not in line
        assert self.lab.root_password not in line and 'mysql://' not in line
        return json.loads(line)
    def ask(self,action):
        self.p.stdin.write(json.dumps({'action':action})+'\n');self.p.stdin.flush();return self.read(320 if action=='migrate' else 40)
    def close(self):
        if self.p.poll() is None:
            self.p.stdin.close()
            try:self.p.wait(12)
            except subprocess.TimeoutExpired:self.p.kill();self.p.wait();raise RuntimeError('LAB_BRIDGE_CLEANUP_TIMEOUT')
        err=self.p.stderr.read()
        for _,password in self.lab.credentials.values():assert password not in err
        assert self.lab.root_password not in err
        self.p.stdout.close();self.p.stderr.close()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--mysql-base',required=True);parser.add_argument('--node',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
    output=Path(args.output).absolute();assert not output.exists()
    base=Path(args.mysql_base).resolve();node=Path(args.node).resolve()
    clean={'PATH':str(node.parent)+':/opt/homebrew/opt/openssl@3/bin:/usr/bin:/bin','LANG':'C','TZ':'UTC','PYTHONDONTWRITEBYTECODE':'1'}
    assert sys.platform=='darwin','THIS_LAB_IS_MAC_ONLY'
    version=subprocess.check_output([str(base/'bin/mysqld'),'--no-defaults','--version'],env=clean,text=True).strip();assert 'Ver 26.7.0 ' in version
    assert '"rootEnvPath": null' in (ROOT/'backend/node_modules/.prisma/client/index.js').read_text()
    protected={str(p):file_digest(p) for p in (ROOT/'backend/prisma').rglob('*') if p.is_file()}
    work=Path(tempfile.mkdtemp(prefix='traceflow-07-1-',dir='/private/tmp')).resolve();owned=(work.stat().st_ino,work.stat().st_uid);os.chmod(work,0o700)
    report={'scope':'LOCAL_DISPOSABLE_ONLY','mysql':version,'node':subprocess.check_output([str(node),'--version'],env=clean,text=True).strip(),'prisma':'6.12.0','platform':'darwin-arm64','cases':[],'productionConnections':0}
    labs=[];bridges=[]
    def case(name,passed,**data):
        report['cases'].append({'name':name,'pass':bool(passed),**data});print(json.dumps({'case':name,'pass':bool(passed)}),flush=True);assert passed,name
    try:
        for fault in (False,True):
            lab=OwnedLab(work,str(base),'26.7.0',ROOT,str(node),None);labs.append(lab);lab.env.update(clean);lab.start();lab.release_accounts()
            runtime=lab.root/'workspace/runtime';admin=lab.root/'workspace/admin'
            (runtime/'backend').mkdir(parents=True);admin.mkdir()
            shutil.copytree(ROOT/'backend/prisma',runtime/'backend/prisma');shutil.copytree(ROOT/'backend/prisma',admin/'prisma')
            (runtime/'backend/package.json').write_text('{"type":"module"}')
            for dest in (runtime/'backend/node_modules',admin/'node_modules'):dest.symlink_to(ROOT/'backend/node_modules',target_is_directory=True)
            if fault:
                for basepath in (runtime/'backend/prisma',admin/'prisma'):
                    p=basepath/'migrations/20261014090000_resumable_evidence_uploads/migration.sql'
                    with p.open('a') as f:f.write('\nALTER TABLE `TF07_intentional_missing_table` ADD COLUMN x INT;\n')
            manifest={'formatVersion':1,'sourceState':'candidate','releaseId':'20261017T120000Z-'+'a'*40+'-'+lab.runid,'schema':schema_contract(runtime)}
            Lab.write_json(runtime/'manifest.json',manifest)
            target={'host':'127.0.0.1','port':lab.port,'schema':lab.schema,'serverUuid':lab.uuid,'version':'26.7.0','migrationUser':lab.credentials['migration'][0],'runtimeUser':lab.credentials['runtime'][0],'migrationAccount':lab.credentials['migration'][0]+'@127.0.0.1','runtimeAccount':lab.credentials['runtime'][0]+'@127.0.0.1','datadir':str(lab.root/'data'),'ownerHash':hashlib.sha256(lab.owner_token.encode()).hexdigest()}
            auth={'formatVersion':1,'authorizationId':str(uuid.uuid4()),'environment':'disposable','operation':'inspect-initial-schema','releaseId':manifest['releaseId'],'descriptorSha256':'b'*64,'expiresAt':(datetime.now(timezone.utc)+timedelta(minutes=9)).isoformat(),'target':target,'gates':{'writersControlled':True},'initialization':{'formatVersion':1,'chainSha256':manifest['schema']['chainSha256'],'schemaSha256':manifest['schema']['schemaSha256'],'inspection':{'path':str(lab.root/'private/inspection.txt'),'sha256':'0'*64,'inspectorAccount':lab.credentials['inspector'][0]+'@127.0.0.1','inspectorRoles':[],'catalogVisibilityReview':'synthetic-explicit-SELECT-EVENT-TRIGGER-SHOW_ROUTINE'},'recovery':{'strategy':'stop-and-review-empty-initialization','planReference':'synthetic-lab-stop-and-review','operatorId':'synthetic-operator'}}}
            path=lab.root/'private/authorization.json'
            def inspection():
                code='import {initialInspectionSql} from '+json.dumps((ROOT/'deploy/scripts/lib/migration-contract.mjs').as_uri())+';let s="";for await(const c of process.stdin)s+=c;const x=JSON.parse(s);process.stdout.write(initialInspectionSql(x.auth,x.manifest));'
                sql=subprocess.check_output([str(node),'--input-type=module','-e',code],input=json.dumps({'auth':auth,'manifest':manifest}).encode(),env=clean,cwd=work)
                data=lab.sql('inspector',sql.decode().rstrip().rstrip(';'))
                # The client's JSON column contains only synthetic identities/counts; never credentials.
                for _,password in lab.credentials.values():assert password.encode() not in data
                dst=Path(auth['initialization']['inspection']['path']);dst.write_bytes(data);dst.chmod(0o600)
                auth['initialization']['inspection']['sha256']=hashlib.sha256(data).hexdigest();Lab.write_json(path,auth)
                report['lastInspectionShape']={'lines':len(data.splitlines()),'columns':len(json.loads(data.splitlines()[0])),'activeRoles':json.loads(data.splitlines()[0])[32],'grants':data.decode().splitlines()[2:-1]}
                return json.loads(data.splitlines()[0])
            def connect(mode='migrate'):
                b=Bridge(lab,runtime,admin,path,mode);bridges.append(b);return b
            observed=inspection();case(('fault-' if fault else '')+'administrative-zero-inventory',observed[20:25]==[0]*5 and observed[30:32]==[1,0])
            b=connect();case(('fault-' if fault else '')+'identity-UTC-permissions-lock',b.ready.get('ready') is True,bridge=b.ready)
            snapshot=b.ask('initial-snapshot');case(('fault-' if fault else '')+'empty-snapshot',snapshot.get('ok') is True and snapshot['result']['historyTablePresent'] is False)
            if not fault:
                competitor=connect();case('concurrent-database-lock-refused',competitor.ready.get('code')=='DATABASE_OPERATION_LOCKED');competitor.close();bridges.remove(competitor)
            b.close();bridges.remove(b)
            if not fault:
                # Real object types, all inside this instance's synthetic schema.
                fixtures=[('table','CREATE TABLE LabObject (id INT)','DROP TABLE LabObject'),('trigger','CREATE TABLE LabObject (id INT); CREATE TRIGGER LabTrigger BEFORE INSERT ON LabObject FOR EACH ROW SET NEW.id=1','DROP TRIGGER LabTrigger; DROP TABLE LabObject'),('view','CREATE VIEW LabObject AS SELECT 1 AS id','DROP VIEW LabObject'),('routine','CREATE PROCEDURE LabObject() SELECT 1','DROP PROCEDURE LabObject'),('event','CREATE EVENT LabObject ON SCHEDULE AT CURRENT_TIMESTAMP + INTERVAL 1 DAY DISABLE DO SELECT 1','DROP EVENT LabObject'),('empty-history','CREATE TABLE _prisma_migrations (id INT)','DROP TABLE _prisma_migrations')]
                for name,create,drop in fixtures:
                    lab.root_sql(create);inspection();blocked=connect();case('nonempty-'+name+'-refused',blocked.ready.get('code')=='INITIAL_SCHEMA_NOT_EMPTY');blocked.close();bridges.remove(blocked)
                    if name=='routine':case('restricted-routine-visibility-is-not-absence',lab.sql('migration','SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()').strip()==b'0')
                    lab.root_sql(drop)
                inspection()
                inspector=lab.credentials['inspector'][0]
                lab.root_sql("REVOKE SHOW_ROUTINE, SELECT ON *.* FROM '"+inspector+"'@'127.0.0.1'")
                # Query of mysql.user now errors; never use a partial transcript as evidence.
                try:inspection();case('inspector-collection-permission-refused',False)
                except RuntimeError:case('inspector-collection-permission-refused',True)
                lab.root_sql("GRANT SHOW_ROUTINE, SELECT ON *.* TO '"+inspector+"'@'127.0.0.1'")
                lab.root_sql("REVOKE EVENT ON *.* FROM '"+inspector+"'@'127.0.0.1'")
                inspection();blocked=connect();case('inspector-hidden-events-not-empty-proof',blocked.ready.get('code')=='INITIAL_METADATA_VISIBILITY');blocked.close();bridges.remove(blocked)
                lab.root_sql("GRANT EVENT ON *.* TO '"+inspector+"'@'127.0.0.1'")
                inspection()
                user=lab.credentials['migration'][0]
                lab.root_sql("REVOKE INDEX ON `"+lab.schema+"`.* FROM '"+user+"'@'127.0.0.1'")
                blocked=connect();case('insufficient-DDL-privilege-refused',blocked.ready.get('code')=='MIGRATION_DDL_PRIVILEGE');blocked.close();bridges.remove(blocked)
                lab.root_sql("GRANT INDEX ON `"+lab.schema+"`.* TO '"+user+"'@'127.0.0.1'")
            inspection();auth['operation']='migrate-initial';auth['beforeFingerprint']=snapshot['result']['fingerprint'];Lab.write_json(path,auth)
            b=connect();case(('fault-' if fault else '')+'prepare-accepted',b.ready.get('ready') is True and b.ask('prepare-migration').get('ok') is True)
            result=b.ask('migrate')
            if fault:
                case('partial-DDL-failure-refused',result.get('code')=='MIGRATION_FAILED')
                counts=json.loads(lab.sql('inspector',"SELECT JSON_ARRAY(COUNT(*),SUM(finished_at IS NOT NULL),SUM(finished_at IS NULL)) FROM _prisma_migrations"))
                case('partial-history-preserved',counts==[68,67,1],history=counts)
            else:
                case('official-68-chain-and-live-diff',result.get('ok') is True and result['result']['migrationCount']==68 and len(result['result']['applied'])==68,result=result.get('result'))
                rows=json.loads(lab.sql('inspector',"SELECT JSON_ARRAY(COUNT(*),SUM(finished_at IS NOT NULL),SUM(rolled_back_at IS NOT NULL)) FROM _prisma_migrations"))
                case('all-68-history-entries-complete',rows==[68,68,0],history=rows)
            b.close();bridges.remove(b)
            # Keep the original empty evidence: replay must be contradicted by live metadata.
            auth['operation']='inspect-initial-schema';Lab.write_json(path,auth)
            b=connect()
            result=b.ask('initial-snapshot') if b.ready.get('ready') else b.ready
            case('partial-history-blocks-retry' if fault else 'initial-replay-blocked',result.get('code')==('FAILED_MIGRATION_HISTORY' if fault else 'INITIAL_SCHEMA_NOT_EMPTY'))
            b.close();bridges.remove(b)
            if not fault:
                auth['operation']='migrate';auth.pop('initialization');Lab.write_json(path,auth)
                b=connect();case('existing-schema-still-requires-backup',b.ready.get('code')=='MIGRATION_AUTHORIZATION');b.close();bridges.remove(b)
            lab.stop()
    except BaseException as e:
        report['error']=type(e).__name__+(':'+str(e) if isinstance(e,AssertionError) and re.fullmatch(r'[A-Za-z0-9_-]+',str(e)) else '')
        raise
    finally:
        for b in bridges:b.close()
        for lab in labs:
            lab.stop();assert lab.process.poll() is not None
            p=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',str(lab.process.pid),'-iTCP','-sTCP:LISTEN'],capture_output=True,env=clean);assert p.returncode==1
        report['processesStopped']=True
        assert work.parent==Path('/private/tmp') and not work.is_symlink() and (work.stat().st_ino,work.stat().st_uid)==owned and owned[1]==os.getuid()
        shutil.rmtree(work);report['temporaryFilesRemoved']=not work.exists()
        report['sourceMigrationsUnchanged']=all(file_digest(Path(k))==v for k,v in protected.items());assert report['sourceMigrationsUnchanged']
        with output.open('x') as f:json.dump(report,f,indent=2);f.write('\n')
    print(json.dumps({'status':'PASS LOCAL','checks':len(report['cases']),'evidence':str(output)}))

if __name__=='__main__':main()
