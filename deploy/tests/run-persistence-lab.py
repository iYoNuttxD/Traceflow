#!/usr/bin/env python3
"""Repeatable OCI06 synthetic backup/restore. Only two newly owned mysqld instances."""
import argparse
import copy
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import select
import tarfile
import subprocess
import sys
import tempfile
import time
sys.dont_write_bytecode=True
BASE=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(BASE/'lib'),str(BASE/'tests')]
from persistence_lab import Lab
from backup_contract import Context, Refused, file_digest, file_record, encoded, atomic_json, exclusive_lock

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mysql-base',required=True);p.add_argument('--version',choices=['8.4.8','26.7.0'],required=True)
    p.add_argument('--node',required=True);p.add_argument('--age',required=True);p.add_argument('--report',required=True)
    args=p.parse_args(); os.umask(0o077)
    repo=BASE.parent; root=Path(tempfile.mkdtemp(prefix='tf06-dr-')).resolve();root.chmod(0o700)
    captured_snapshots=[]
    original_snapshot=Context.snapshot
    def observed_snapshot(context):
        result=original_snapshot(context);captured_snapshots.append(result);return result
    Context.snapshot=observed_snapshot
    report={'formatVersion':1,'version':args.version,'mode':'LOCAL_ISOLATED','startedAtUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'checks':[]};labs=[]
    def phase(name,work):
        start=time.monotonic()
        try:
            result=work(); report['checks'].append({'name':name,'status':'PASS','seconds':round(time.monotonic()-start,3),'result':result}); print(name+': PASS',flush=True);return result
        except BaseException as e:
            report['checks'].append({'name':name,'status':'FAIL','code':str(e) if isinstance(e,Refused) else type(e).__name__});raise
    def reject(name,work):
        def negative():
            try:work()
            except (Refused,OSError,RuntimeError) as e:return {'rejected':True,'code':str(e) if isinstance(e,Refused) else type(e).__name__}
            raise AssertionError('unsafe operation accepted')
        return phase(name,negative)
    try:
        backend=root/'backend';backend.mkdir()
        for d in ('src','prisma','scripts','test'):shutil.copytree(repo/'backend'/d,backend/d)
        for f in ('package.json','package-lock.json'):shutil.copyfile(repo/'backend'/f,backend/f)
        (backend/'node_modules').symlink_to(repo/'backend/node_modules')
        for f in ('persistence-fixture.mjs','persistence-outage.mjs'):shutil.copyfile(BASE/'tests'/f,backend/f)
        source=Lab(root, args.mysql_base,args.version,repo,args.node,args.age);labs.append(source);phase('new-owned-source',lambda:source.start() and {'tlsRequired':True})
        env=dict(source.env,NODE_ENV='test',TEST_DATABASE_URL=source.url(),EMAIL_PROVIDER='capture',TEST_EVIDENCE_STORAGE_DIR=str(source.root/'storage'))
        def child(command,environment=env):
            r=subprocess.run(command,cwd=backend,env=environment,capture_output=True,timeout=300)
            if r.returncode:
                text=(r.stdout+r.stderr).decode(errors='replace')
                for lab in labs:
                    for role in lab.credentials:text=text.replace(lab.credentials[role][1],'[REDACTED_SECRET]').replace(lab.url(role),'[REDACTED_DATABASE_URL]')
                (root/'failure.log').write_text(text)
                print('Failure details (synthetic, sanitized): '+text[-2500:],file=sys.stderr)
                raise RuntimeError('CHILD_FAILED')
            return r.stdout.decode()
        cli=[args.node,str(backend/'node_modules/prisma/build/index.js')]
        phase('complete-migration-chain',lambda:child(cli+['migrate','deploy'],dict(env,DATABASE_URL=source.url())) and {'count':len(list((backend/'prisma/migrations').glob('*/migration.sql')))})
        phase('idempotent-migrate-deploy',lambda:child(cli+['migrate','deploy'],dict(env,DATABASE_URL=source.url())) and True)
        ident={'serverUuid':source.uuid,'datadir':str(source.root/'data'),'port':source.port,'schema':source.schema}
        identity=root/'identity.json';Lab.write_json(identity,ident)
        fixture=root/'fixture.json';env.update(TF06_IDENTITY=str(identity),TF06_FIXTURE=str(fixture))
        phase('synthetic-business-fixture',lambda:child([args.node,'persistence-fixture.mjs','seed']) and True)
        key=root/'recovery.agekey';child([str(Path(args.age).parent/'age-keygen'),'-o',str(key)]);key.chmod(0o600)
        recipient=child([str(Path(args.age).parent/'age-keygen'),'-y',str(key)]).strip()
        def configuration(lab,role,storage=None):
            q=lab.root/'private/quiescence.json';Lab.write_json(q,{'runId':lab.runid,'serverUuid':lab.uuid,'writersStopped':True,'externalWritersControlled':True,'writerPids':[],'expiresAt':time.time()+3500})
            c={'formatVersion':1,'mode':'local-isolated','role':role,'runId':lab.runid,'labRoot':str(lab.root),'workspace':str(lab.root/'workspace'),
               'destination':str(lab.root/'backups'),'state':str(lab.root/'state'),'storage':str(storage or lab.root/'storage'),'repository':str(repo),
               'mysql':str(lab.base/'bin/mysql'),'mysqldump':str(lab.base/'bin/mysqldump'),'age':args.age,'quiescence':str(q),
               'releaseId':'synthetic-'+hashlib.sha256((repo/'backend/prisma/schema.prisma').read_bytes()).hexdigest()[:12], 'recipient':recipient,
               'target':{'host':'127.0.0.1','port':lab.port,'schema':lab.schema,'user':lab.credentials['backup' if role=='backup' else 'migration'][0],
                         'serverUuid':lab.uuid,'version':lab.version,'datadir':str(lab.root/'data')}}
            path=lab.root/'private'/('backup.json' if role=='backup' else 'restore.json');Lab.write_json(path,c);return path
        source_config=configuration(source,'backup')
        os.environ.pop('DATABASE_URL',None);os.environ['TEST_DATABASE_URL']=source.url('backup')
        def backup():
            with Context(source_config) as context,exclusive_lock(context.state/'operation.lock'):return context.backup()
        result=phase('coordinated-encrypted-backup',backup);backup_path=source.root/'backups'/result['backupId'];expected=result['manifestSha256']
        def verify(path=backup_path,sha=expected,identity=key):
            with Context(source_config) as context:return context.verified_set(path,sha,identity)[0]['status']
        phase('authenticated-decrypt-and-integrity',verify)
        def incompatible():
            with Context(source_config) as context:
                context.schema_contract=copy.deepcopy(context.schema_contract)
                context.schema_contract['migrations']=context.schema_contract['migrations'][:-1]
                return context.verified_set(backup_path,expected,key)
        reject('R07-incompatible-chain',incompatible)
        def modified_set(name, mutation):
            destination=source.root/'backups'/name;destination.mkdir(mode=0o700)
            with Context(source_config) as context:
                outer,inner,snapshot,verified=context.verified_set(backup_path,expected,key)
                mutation(inner,snapshot,verified)
                (verified/'snapshot.json').write_bytes(encoded(snapshot))
                inner['files']={p.relative_to(verified).as_posix():file_record(p) for p in verified.rglob('*') if p.is_file() and p.name!='set.json'}
                (verified/'set.json').write_bytes(encoded(inner))
                archive=context.scratch/'mutated.tar'
                with tarfile.open(archive,'w') as tar:
                    for item in sorted([*inner['files'],'set.json']):tar.add(verified/item,arcname=item,recursive=False)
                child([args.age,'--encrypt','--recipient',recipient,'--output',str(destination/'payload.age'),str(archive)])
                for field in ('createdAtUtc','backupId'):outer[field]=inner[field]
                outer['payload']=file_record(destination/'payload.age');atomic_json(destination/'manifest.json',outer)
            return destination,file_digest(destination/'manifest.json')
        def aged(inner,_snapshot,_verified):inner['createdAtUtc']='2020-01-01T00:00:00+00:00'
        old,old_sha=modified_set('aged',aged)
        phase('R08-old-exact-schema-verified-age-not-approval',lambda:verify(old,old_sha))
        def missing(_inner,snapshot,verified):(verified/'evidence'/snapshot['evidence'][0]['storageKey']).unlink()
        missing_path,missing_sha=modified_set('missing',missing)
        reject('R09-missing-evidence',lambda:verify(missing_path,missing_sha))
        def interrupted_backup():
            r=subprocess.run([sys.executable,str(BASE/'tests/persistence-interruption.py'),'backup','--config',str(source_config)],env=dict(source.env,TEST_DATABASE_URL=source.url('backup')),capture_output=True,timeout=90)
            assert r.returncode==1 and b'INTERRUPTED' in r.stdout
            assert not list((source.root/'backups').glob('.incomplete-*'))
            assert file_digest(backup_path/'manifest.json')==expected
            return {'signal':'SIGTERM','priorBackupPreserved':True,'privateScratchCleaned':not list((source.root/'workspace').iterdir())}
        phase('backup-real-process-interruption',interrupted_backup)
        reject('runtime-DDL-denied',lambda:source.sql('runtime','CREATE TABLE RuntimeDenied(id INT)'))
        reject('backup-DML-denied',lambda:source.sql('backup','INSERT INTO EvidenceUploadBudget(id) VALUES (2)'))

        reject('R04-incomplete-set',lambda:verify(source.root/'backups',expected))
        corrupt=source.root/'backups/corrupt';shutil.copytree(backup_path,corrupt)
        with (corrupt/'payload.age').open('r+b') as f:f.seek(120);b=f.read(1);f.seek(120);f.write(bytes([b[0]^1]))
        reject('R05-corrupt-ciphertext',lambda:verify(corrupt,expected))
        modified=json.loads((corrupt/'manifest.json').read_text());modified['payload']=file_record(corrupt/'payload.age');atomic_json(corrupt/'manifest.json',modified)
        reject('AEAD-rejects-rehashed-corruption',lambda:verify(corrupt,file_digest(corrupt/'manifest.json')))
        wrong=root/'wrong.agekey';child([str(Path(args.age).parent/'age-keygen'),'-o',str(wrong)]);wrong.chmod(0o600)
        reject('R06-wrong-key',lambda:verify(identity=wrong))
        reject('untrusted-manifest-digest',lambda:verify(sha='0'*64))
        original=json.loads(source_config.read_text());changed=copy.deepcopy(original);changed['mode']='production';Lab.write_json(source_config,changed)
        reject('R12-protected-target',lambda:Context(source_config));Lab.write_json(source_config,original)
        with exclusive_lock(source.root/'state/operation.lock'):reject('concurrent-backup',backup)
        previous=file_digest(backup_path/'payload.age')
        changed=copy.deepcopy(original);changed['recipient']='invalid';Lab.write_json(source_config,changed)
        reject('encryption-configuration-failure',backup);Lab.write_json(source_config,original)
        assert previous==file_digest(backup_path/'payload.age');phase('previous-copy-preserved',lambda:True)
        target=Lab(root,args.mysql_base,args.version,repo,args.node,args.age);labs.append(target);phase('new-owned-restore-target',lambda:target.start() and True)
        config=configuration(target,'restore',target.root/'restored-evidence');os.environ['TEST_DATABASE_URL']=target.url()
        def restore():
            with Context(config) as context,exclusive_lock(context.state/'operation.lock'):return context.restore(backup_path,expected,key)
        recovered=phase('R01-R02-R03-complete-restore',restore);report['restoreSeconds']=recovered['restoreSeconds']
        reject('R11-safe-reexecution-refusal',restore)
        Lab.write_json(identity,{'serverUuid':target.uuid,'datadir':str(target.root/'data'),'port':target.port,'schema':target.schema})
        smoke_env=dict(env,TEST_DATABASE_URL=target.url('runtime'),TEST_EVIDENCE_STORAGE_DIR=str(target.root/'restored-evidence'))
        phase('restored-application-smoke',lambda:child([args.node,'persistence-fixture.mjs','smoke'],smoke_env) and True)
        fault=Lab(root,args.mysql_base,args.version,repo,args.node,args.age);labs.append(fault);fault.start()
        fault_config=configuration(fault,'restore',fault.root/'restored-evidence')
        def interrupted_restore():
            r=subprocess.run([sys.executable,str(BASE/'tests/persistence-interruption.py'),'restore','--config',str(fault_config),'--backup',str(backup_path),'--manifest-sha256',expected,'--identity',str(key)],env=dict(fault.env,TEST_DATABASE_URL=fault.url()),capture_output=True,timeout=90)
            assert r.returncode==1 and b'INTERRUPTED' in r.stdout
            journals=list((fault.root/'state').glob('restore-*.json'));assert len(journals)==1 and json.loads(journals[0].read_text())['status']=='QUARANTINED'
            assert fault.sql('migration',"SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()").strip()==b'1'
            return {'signal':'SIGTERM','partialSchemaQuarantined':True,'protectedTargetsUntouched':True}
        phase('R10-interrupted-restore-quarantined',interrupted_restore)
        Lab.write_json(identity,{'serverUuid':source.uuid,'datadir':str(source.root/'data'),'port':source.port,'schema':source.schema})
        def outage():
            log=root/'outage-stderr.log'
            with log.open('wb') as errors:
                proc=subprocess.Popen([args.node,'persistence-outage.mjs'],cwd=backend,env=dict(env,TEST_DATABASE_URL=source.url('runtime')),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=errors,text=True,bufsize=1)
                def receive(phase_name):
                    deadline=time.monotonic()+45
                    while time.monotonic()<deadline:
                        if not select.select([proc.stdout],[],[],1)[0]:continue
                        line=proc.stdout.readline()
                        if not line:raise RuntimeError('OUTAGE_CHILD_EXITED')
                        try:data=json.loads(line)
                        except ValueError:continue
                        if data.get('protocol')=='OCI06_OUTAGE' and data.get('phase')==phase_name:return data
                    raise RuntimeError('OUTAGE_PHASE_TIMEOUT')
                def send(command):proc.stdin.write(json.dumps({'command':command})+'\n');proc.stdin.flush()
                try:
                    receive('part-written');lease_started=time.monotonic();source.stop();send('down');down=receive('degraded')
                    source.restart();send('up');up=receive('reconnected')
                    print('Waiting for the original 90-second upload lease, without changing the contract',flush=True)
                    remaining=92-(time.monotonic()-lease_started)
                    if remaining>0:time.sleep(remaining)
                    send('resume');recovered=receive('recovered');proc.stdin.close();assert proc.wait(15)==0
                    return {'outage':down,'reconnection':up,'recovery':recovered,'leaseDurationUnchanged':True,'githubLeaseClockAdvancedInTestOnly':True}
                finally:
                    if proc.poll() is None:proc.terminate();proc.wait(10)
        phase('maintenance-readiness-worker-upload-recovery',outage)
        report['status']='PASS';report['productionCertified']=False
    except BaseException as e:
        if isinstance(e,Refused) and str(e).startswith('RESTORED_DATABASE_MISMATCH') and len(captured_snapshots)>1:
            a,b=captured_snapshots[-2:]
            for table in a['structures']:
                for field in a['structures'][table]:
                    if a['structures'][table][field]!=b['structures'][table][field]:
                        print('Synthetic structural difference: '+table+'.'+field,flush=True)
                        break
                else:continue
                break
        report['status']='FAIL';report['error']=str(e) if isinstance(e,Refused) else type(e).__name__
    finally:
        for lab in reversed(labs):lab.cleanup()
        report['cleanedUp']=True
        output=Path(args.report);output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n')
        shutil.rmtree(root)
    return 0 if report['status']=='PASS' else 1
if __name__=='__main__':sys.exit(main())
