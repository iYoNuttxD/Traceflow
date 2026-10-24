"""Coordinated backup v1. No implicit credentials, network discovery or retention deletion."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
from urllib.parse import urlsplit, unquote, parse_qs
from release_contract import (Refused, require, encoded, digest, file_digest, private_json,
                              trusted_path, atomic_json, fsync_dir, exclusive_lock, schema_contract)

MAX_BYTES = 4 * 1024**3
UUID = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
TABLE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,63}$')

def utc(): return dt.datetime.now(dt.timezone.utc).isoformat()

def run(args, *, input=None, output=None, timeout=300):
    # A password is only in a 0600 defaults file, never argv or inherited config.
    env={'PATH':'/usr/bin:/bin', 'HOME':'/nonexistent', 'LANG':'C.UTF-8', 'TZ':'UTC', 'MYSQL_HISTFILE':'/dev/null'}
    p=subprocess.Popen([str(x) for x in args], stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,
                       stdout=output or subprocess.PIPE, stderr=subprocess.PIPE, env=env, start_new_session=True)
    try:
        stdout, _ = p.communicate(input, timeout=timeout)
        require(p.returncode == 0, 'TOOL_FAILED_' + Path(args[0]).name.upper().replace('-','_'))
        return stdout or b''
    except BaseException:
        if p.poll() is None:
            os.killpg(p.pid, signal.SIGTERM)
            try: p.wait(3)
            except subprocess.TimeoutExpired: os.killpg(p.pid,signal.SIGKILL); p.wait()
        raise

def private_dir(path):
    path=trusted_path(Path(path), directory=True, uid=os.geteuid())
    require(path.stat().st_mode & 0o077 == 0, 'PRIVATE_DIRECTORY_REQUIRED')
    return path

def schema_name(value):
    require(isinstance(value,str) and TABLE.fullmatch(value), 'INVALID_IDENTIFIER')
    return '`'+value+'`'

def file_record(path):
    return {'sha256':file_digest(path),'size':path.stat().st_size}

def storage_inventory(root):
    private_dir(root)
    result={}
    for p in sorted(root.rglob('*')):
        name=p.relative_to(root).as_posix(); st=p.lstat()
        require(not p.is_symlink() and st.st_uid==os.geteuid() and not st.st_mode & 0o077, 'STORAGE_PATH_UNSAFE')
        if p.is_dir():
            require(name=='.uploads' or re.fullmatch(r'\.uploads/'+UUID+r'(?:/work-'+UUID+r')?',name), 'STORAGE_DIRECTORY_UNKNOWN')
            continue
        require(p.is_file() and re.fullmatch(UUID+r'|\.uploads/'+UUID+r'/(?:part-'+UUID+r'|work-'+UUID+r'/'+UUID+r')',name), 'STORAGE_FILE_UNKNOWN')
        result[name]=file_record(p)
    return result

def validate_files(snapshot, files):
    for row in snapshot['evidence']:
        key=row['storageKey']
        require(re.fullmatch(UUID,key) and files.get(key)=={'sha256':row['sha256'],'size':row['sizeBytes']}, 'EVIDENCE_MISSING_OR_CORRUPT')
    for row in snapshot['uploads']:
        require(re.fullmatch(UUID,row['id']), 'UPLOAD_ID_INVALID')
        if row['status'] not in ('OPEN','FINALIZING'): continue
        for f in row['filesJson']:
            for part in f['parts'].values():
                key='.uploads/'+row['id']+'/'+part['key']
                require(files.get(key)=={'sha256':part['sha256'],'size':part['sizeBytes']}, 'UPLOAD_PART_MISSING_OR_CORRUPT')

def check_space(path, needed):
    require(0 < needed <= MAX_BYTES and shutil.disk_usage(path).free >= needed + 512*1024**2, 'INSUFFICIENT_SPACE')

def unpack_verified(archive, destination):
    # No extractall: only fixed logical members, no devices/links/traversal/duplicates.
    seen=set(); total=0
    with tarfile.open(archive,'r:') as tar:
        for entry in tar:
            name=entry.name
            allowed=name in ('database.sql','snapshot.json','set.json') or (name.startswith('evidence/') and
                re.fullmatch(UUID+r'|\.uploads/'+UUID+r'/(?:part-'+UUID+r'|work-'+UUID+r'/'+UUID+r')',name[9:]))
            require(allowed and name not in seen and entry.isfile() and not entry.linkname and entry.size>=0, 'ARCHIVE_MEMBER_UNSAFE')
            total+=entry.size; require(total <= MAX_BYTES and len(seen)<100000, 'ARCHIVE_LIMIT')
            seen.add(name); target=destination/name
            target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            with target.open('xb') as f:
                os.chmod(target,0o600); shutil.copyfileobj(tar.extractfile(entry),f,1024*1024)
    require({'database.sql','snapshot.json','set.json'}.issubset(seen), 'INCOMPLETE_BACKUP')
    data=json.loads((destination/'set.json').read_text())
    require(data.get('formatVersion')==1 and data.get('application')=='TraceFlow' and data.get('status')=='COMPLETE', 'SET_FORMAT')
    actual={p.relative_to(destination).as_posix():file_record(p) for p in destination.rglob('*') if p.is_file() and p.name!='set.json'}
    require(actual==data['files'], 'SET_INTEGRITY')
    snapshot=json.loads((destination/'snapshot.json').read_text())
    validate_files(snapshot,{n[9:]:v for n,v in actual.items() if n.startswith('evidence/')})
    return data,snapshot

class Context:
    def __init__(self, config_path):
        self.config=private_json(Path(config_path).absolute()); c=self.config
        require(c.get('formatVersion')==1 and c.get('mode')=='local-isolated', 'LOCAL_ONLY_OCI06')
        # Production backup activation is a separate authorization/delivery; no flag can bypass this.
        require(not os.environ.get('DATABASE_URL'), 'AMBIGUOUS_DATABASE_URL')
        self.root=private_dir(c['labRoot']); marker=private_json(self.root/'.traceflow-dr-lab.json')
        require(marker['task']=='OCI-DEPLOY-06' and marker['runId']==c['runId'], 'LAB_OWNERSHIP')
        self.target=c['target']; t=self.target
        value=os.environ.get('TEST_DATABASE_URL'); require(value, 'TEST_DATABASE_URL_REQUIRED')
        url=urlsplit(value); options=parse_qs(url.query,keep_blank_values=True)
        require(url.scheme=='mysql' and url.hostname=='127.0.0.1' and url.port and 49152<=url.port<=65535 and not url.fragment, 'PROTECTED_DATABASE_TARGET')
        require(re.fullmatch(r'tf_oci_[a-f0-9]{12}_test',unquote(url.path[1:])) and
                unquote(url.path[1:])==t['schema'] and url.port==t['port'] and t['host']=='127.0.0.1' and
                unquote(url.username or '')==t['user'] and url.password and t['user'] not in ('root','admin'), 'TARGET_MISMATCH')
        require(marker['serverUuid']==t['serverUuid'] and marker['datadir']==t['datadir'] and marker['port']==t['port'], 'LAB_SERVER_MISMATCH')
        require(Path(t['datadir']).is_relative_to(self.root), 'PROTECTED_DATADIR')
        require(options.get('sslaccept')==['strict'] and len(options.get('sslcert',[]))==1 and
                set(options)<= {'sslaccept','sslcert','connection_limit','connect_timeout','pool_timeout','socket_timeout'}, 'STRICT_TLS_REQUIRED')
        self.ca=trusted_path(Path(options['sslcert'][0])); self.schema=t['schema']
        self.workspace=private_dir(c['workspace']); self.destination=private_dir(c['destination']); self.state=private_dir(c['state'])
        for p in (self.workspace,self.destination,self.state): require(p.is_relative_to(self.root), 'PATH_OUTSIDE_LAB')
        require(self.workspace!=self.destination and not self.workspace.is_relative_to(self.destination), 'WORKSPACE_NOT_SEPARATE')
        self.storage=Path(c['storage']).absolute()
        require(self.storage.is_relative_to(self.root) and not self.destination.is_relative_to(self.storage), 'PROTECTED_STORAGE')
        self.repo=trusted_path(Path(c['repository']),directory=True)
        self.schema_contract=schema_contract(self.repo)
        self.mysql=trusted_path(Path(c['mysql'])); self.dump=trusted_path(Path(c['mysqldump'])); self.age=trusted_path(Path(c['age']))
        for tool in (self.mysql,self.dump):
            version=run([tool,'--no-defaults','--version']).decode()
            require(t['version'] in version and t['version'] in ('8.4.8','26.7.0'), 'MYSQL_TOOL_VERSION')
        require(run([self.age,'--version']).decode().strip()=='v1.3.2', 'AGE_VERSION')
        self.secret={'user':unquote(url.username),'password':unquote(url.password),'host':url.hostname,'port':str(url.port)}
        require(all('\n' not in v and '\r' not in v and '\0' not in v for v in self.secret.values()), 'INVALID_CREDENTIAL_ENCODING')
        self.option=None
    def __enter__(self):
        self.scratch=Path(tempfile.mkdtemp(prefix='.private-',dir=self.workspace)); self.scratch.chmod(0o700)
        self.option=self.scratch/'client.cnf'
        with self.option.open('x') as f:
            os.chmod(self.option,0o600)
            f.write('[client]\n'+''.join(k+'="'+v.replace('\\','\\\\').replace('"','\\"')+'"\n' for k,v in self.secret.items()))
        return self
    def __exit__(self,*_):
        shutil.rmtree(self.scratch)
    def args(self, tool=None):
        return [tool or self.mysql,'--defaults-file='+str(self.option),'--no-login-paths','--protocol=TCP','--ssl-mode=VERIFY_IDENTITY',
                '--ssl-ca='+str(self.ca),'--tls-version=TLSv1.2,TLSv1.3','--default-character-set=utf8mb4'] + ([] if tool else ['--connect-timeout=5'])
    def query(self, sql):
        raw=run(self.args()+['--batch','--raw','--skip-column-names',self.schema],input=(sql+';\n').encode(),timeout=30)
        return raw.decode().splitlines()
    def rows(self,sql): return [json.loads(row) for row in self.query(sql)]
    def identity(self):
        [row]=self.rows("SELECT JSON_OBJECT('uuid',@@server_uuid,'port',@@port,'db',DATABASE(),'datadir',@@datadir,'version',VERSION())")
        t=self.target
        require(row['uuid']==t['serverUuid'] and row['port']==t['port'] and row['db']==self.schema and
                row['version']==t['version'] and row['datadir'].rstrip('/')==t['datadir'].rstrip('/'), 'SERVER_IDENTITY_MISMATCH')
        require(self.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'")[0].split('\t')[-1], 'TLS_REQUIRED')
        role=self.config.get('role'); require(role in ('backup','restore'), 'CREDENTIAL_ROLE_REQUIRED')
        allowed={'SELECT','SHOW VIEW'} if role=='backup' else {'SELECT','INSERT','UPDATE','DELETE','CREATE','ALTER','DROP','INDEX','REFERENCES','CREATE TEMPORARY TABLES'}
        prefix='`tf\\_oci\\_'+self.config['runId']+'\\_%`.*'
        for grant in self.query('SHOW GRANTS FOR CURRENT_USER'):
            if re.fullmatch(r'GRANT USAGE ON \*\.\* TO .+',grant) and 'GRANT OPTION' not in grant: continue
            match=re.fullmatch(r'GRANT ([A-Z ,]+) ON (.+?) TO .+',grant)
            require(match and match[2] in (schema_name(self.schema)+'.*',prefix) and 'GRANT OPTION' not in grant and
                    set(match[1].split(', '))<=allowed, 'EXCESSIVE_CREDENTIAL_PRIVILEGES')
        return row
    def quiescence(self):
        q=private_json(Path(self.config['quiescence']))
        require(q.get('runId')==self.config['runId'] and q.get('serverUuid')==self.target['serverUuid'] and
                q.get('writersStopped') is True and q.get('externalWritersControlled') is True and
                time.time()<q.get('expiresAt',0)<time.time()+3600, 'WRITERS_NOT_QUIESCENT')
        for pid in q.get('writerPids',[]):
            try: os.kill(pid,0)
            except ProcessLookupError: continue
            raise Refused('WRITER_PROCESS_ALIVE')
        # This receipt is an operator attestation, not a distributed database lock.
    def snapshot(self):
        self.identity()
        tables=self.rows("SELECT JSON_OBJECT('name',TABLE_NAME,'engine',ENGINE,'collation',TABLE_COLLATION,'type',TABLE_TYPE) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY BINARY TABLE_NAME")
        require(tables and all(t['engine']=='InnoDB' and t['type']=='BASE TABLE' for t in tables),'UNSUPPORTED_DATABASE_OBJECT')
        for table, column in [('TRIGGERS','TRIGGER_SCHEMA'),('ROUTINES','ROUTINE_SCHEMA'),('EVENTS','EVENT_SCHEMA')]:
            require(self.query('SELECT COUNT(*) FROM INFORMATION_SCHEMA.'+table+' WHERE '+column+'=DATABASE()')==['0'],'UNSUPPORTED_DATABASE_OBJECT')
        ledger=self.rows("SELECT JSON_OBJECT('name',migration_name,'sha256',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL) FROM _prisma_migrations ORDER BY BINARY migration_name")
        require([{'name':x['name'],'sha256':x['sha256']} for x in ledger]==self.schema_contract['migrations'] and
                all(x['finished'] and not x['rolledBack'] for x in ledger),'MIGRATION_CHAIN_MISMATCH')
        structures={}; data={}
        for table in tables:
            name=table['name']; ident=schema_name(name)
            cols=self.rows("SELECT JSON_OBJECT('name',COLUMN_NAME,'type',COLUMN_TYPE,'nullable',IS_NULLABLE,'default',COLUMN_DEFAULT,'extra',EXTRA,'collation',COLLATION_NAME,'charset',CHARACTER_SET_NAME,'generation',GENERATION_EXPRESSION) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='"+name+"' ORDER BY ORDINAL_POSITION")
            indexes=self.query('SHOW INDEX FROM '+ident)
            # SHOW CREATE is stable on the exact server version; AUTO_INCREMENT represents data, not structure.
            ddl=self.query('SHOW CREATE TABLE '+ident)
            structures[name]={'columns':cols,'ddl':re.sub(r' CHARACTER SET [a-zA-Z0-9_]+','',re.sub(r'AUTO_INCREMENT=\d+','AUTO_INCREMENT=<counter>','\n'.join(ddl))),
                              'indexes':[line.split('\t')[:6] for line in indexes]}
            expressions=','.join(schema_name(c['name']) for c in cols)
            rows=sorted(self.query('SELECT JSON_ARRAY('+expressions+') FROM '+ident))
            data[name]={'count':len(rows),'sha256':digest(encoded(rows))}
        evidence=self.rows("SELECT JSON_OBJECT('storageKey',storageKey,'sha256',sha256,'sizeBytes',sizeBytes) FROM TestEvidence ORDER BY storageKey")
        uploads=self.rows("SELECT JSON_OBJECT('id',id,'status',status,'filesJson',filesJson,'leaseUntil',leaseUntil,'expiresAt',expiresAt) FROM EvidenceUpload ORDER BY id")
        # Explicit anti-joins catch referential damage even when FOREIGN_KEY_CHECKS was disabled on import.
        fks=self.rows("SELECT JSON_OBJECT('table',TABLE_NAME,'constraint',CONSTRAINT_NAME,'column',COLUMN_NAME,'refTable',REFERENCED_TABLE_NAME,'refColumn',REFERENCED_COLUMN_NAME) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION")
        groups={}
        for fk in fks: groups.setdefault((fk['table'],fk['constraint'],fk['refTable']),[]).append(fk)
        for (table,_,ref), keys in groups.items():
            present=' AND '.join('c.'+schema_name(k['column'])+' IS NOT NULL' for k in keys)
            relation=' AND '.join('c.'+schema_name(k['column'])+'=p.'+schema_name(k['refColumn']) for k in keys)
            sql='SELECT COUNT(*) FROM '+schema_name(table)+' c WHERE '+present+' AND NOT EXISTS (SELECT 1 FROM '+schema_name(ref)+' p WHERE '+relation+')'
            require(self.query(sql)==['0'],'FOREIGN_KEY_ORPHAN')
        return {'tables':tables,'structures':structures,'data':data,'evidence':evidence,'uploads':uploads,'foreignKeys':len(groups)}

    def backup(self):
        require(self.config.get('role')=='backup','BACKUP_ROLE_REQUIRED')
        self.quiescence(); self.identity()
        private_dir(self.storage)
        before=self.snapshot(); files=storage_inventory(self.storage); validate_files(before,files)
        estimated=sum(x['size'] for x in files.values())+int(self.query('SELECT COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()')[0])
        check_space(self.workspace,max(64*1024**2,estimated*4)); check_space(self.destination,max(64*1024**2,estimated*2))
        dump_path=self.scratch/'database.sql'
        with dump_path.open('xb') as f:
            os.chmod(dump_path,0o600)
            run(self.args(self.dump)+['--single-transaction','--quick','--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF',
                '--hex-blob','--skip-add-drop-table','--skip-add-locks','--skip-disable-keys','--skip-comments','--skip-triggers','--routines=false','--events=false',self.schema],output=f)
            f.flush(); os.fsync(f.fileno())
        require(dump_path.stat().st_size>0,'EMPTY_DUMP')
        (self.scratch/'snapshot.json').write_bytes(encoded(before)); (self.scratch/'snapshot.json').chmod(0o600)
        for name in files:
            dest=self.scratch/'evidence'/name; dest.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
            shutil.copyfile(self.storage/name,dest); dest.chmod(0o600)
        self.quiescence()
        require(before==self.snapshot() and files==storage_inventory(self.storage),'WRITER_CHANGED_SNAPSHOT')
        copied={p.relative_to(self.scratch).as_posix():file_record(p) for p in self.scratch.rglob('*') if p.is_file() and p!=self.option}
        require({n[9:]:v for n,v in copied.items() if n.startswith('evidence/')}==files,'STORAGE_COPY_INTEGRITY')
        backup_id=time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())+'-'+os.urandom(6).hex()
        inner={'formatVersion':1,'application':'TraceFlow','backupId':backup_id,'createdAtUtc':utc(),'status':'COMPLETE',
               'databaseVersion':self.target['version'],'schema':self.schema_contract,'releaseId':self.config['releaseId'],
               'consistency':'quiesced-writers-single-transaction-v1','files':copied,
               'uploadPolicy':'preserve-ledger-and-parts; wait-for-expired-leases-before-runtime'}
        (self.scratch/'set.json').write_bytes(encoded(inner)); (self.scratch/'set.json').chmod(0o600)
        archive=self.scratch/'set.tar'
        with tarfile.open(archive,'w',format=tarfile.PAX_FORMAT) as tar:
            for name in sorted([*copied,'set.json']): tar.add(self.scratch/name,arcname=name,recursive=False)
        archive.chmod(0o600)
        recipient=self.config['recipient']; require(re.fullmatch(r'age1[023456789acdefghjklmnpqrstuvwxyz]{58}',recipient),'AGE_RECIPIENT_REQUIRED')
        # Publish the set directory only after encryption and fsync. Existing sets are never removed.
        partial=Path(tempfile.mkdtemp(prefix='.incomplete-',dir=self.destination)); partial.chmod(0o700)
        try:
            cipher=partial/'payload.age'
            run([self.age,'--encrypt','--recipient',recipient,'--output',cipher,archive]); cipher.chmod(0o600)
            with cipher.open('rb') as f: os.fsync(f.fileno())
            outer={k:inner[k] for k in ('formatVersion','application','backupId','createdAtUtc','databaseVersion','releaseId','consistency')}
            outer.update(status='COMPLETE',encrypted=True,algorithm='age-X25519',payload=file_record(cipher),
                         schemaSha256=self.schema_contract['chainSha256'],restoreStatus='NOT_REHEARSED')
            atomic_json(partial/'manifest.json',outer); fsync_dir(partial)
            final=self.destination/backup_id; os.rename(partial,final); fsync_dir(self.destination)
            return {'status':'COMPLETE','backupId':backup_id,'manifestSha256':file_digest(final/'manifest.json'),'restoreStatus':'NOT_REHEARSED'}
        except BaseException:
            # Only our newly allocated incomplete ciphertext directory; never previous backups.
            shutil.rmtree(partial); raise

    def verified_set(self, backup_path, expected_digest, identity_path):
        backup=private_dir(backup_path)
        require(re.fullmatch('[a-f0-9]{64}',expected_digest or ''),'TRUSTED_MANIFEST_DIGEST_REQUIRED')
        outer=private_json(backup/'manifest.json')
        require(file_digest(backup/'manifest.json')==expected_digest,'MANIFEST_CHECKSUM')
        require(outer.get('status')=='COMPLETE' and outer.get('encrypted') is True and outer.get('algorithm')=='age-X25519','INCOMPLETE_BACKUP')
        cipher=trusted_path(backup/'payload.age',uid=os.geteuid()); require(file_record(cipher)==outer['payload'],'CIPHERTEXT_CHECKSUM')
        key=trusted_path(Path(identity_path),uid=os.geteuid()); require(key.stat().st_mode & 0o077==0 and not key.is_relative_to(self.destination),'PRIVATE_KEY_LOCATION')
        check_space(self.workspace,MAX_BYTES)
        archive=self.scratch/'restored.tar'
        run([self.age,'--decrypt','--identity',key,'--output',archive,cipher]); archive.chmod(0o600)
        destination=self.scratch/'verified'; destination.mkdir(mode=0o700)
        data,snapshot=unpack_verified(archive,destination)
        require(all(data[k]==outer[k] for k in ('backupId','createdAtUtc','databaseVersion','releaseId','consistency')) and data['schema']==self.schema_contract and data['databaseVersion']==self.target['version'] and outer['schemaSha256']==data['schema']['chainSha256'], 'INCOMPATIBLE_SCHEMA_OR_VERSION')
        return outer,data,snapshot,destination

    def restore(self, backup_path, expected_digest, identity_path):
        started=time.monotonic()
        require(self.config.get('role')=='restore','RESTORE_ROLE_REQUIRED')
        outer,data,snapshot,verified=self.verified_set(backup_path,expected_digest,identity_path)
        self.quiescence(); self.identity()
        require(not os.path.lexists(self.storage),'RESTORE_STORAGE_EXISTS')
        private_dir(self.storage.parent)
        require(self.query('SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()')==['0'],'RESTORE_DATABASE_NOT_EMPTY')
        journal=self.state/('restore-'+self.target['serverUuid']+'-'+self.schema+'.json')
        require(not journal.exists(),'RESTORE_ALREADY_ATTEMPTED')
        atomic_json(journal,{'status':'IN_PROGRESS','backupId':outer['backupId'],'startedAtUtc':utc()})
        try:
            # Credential only has DDL/DML on this disposable schema; no global/FILE/user privileges.
            with (verified/'database.sql').open('rb') as sql:
                run(self.args()+['--binary-mode','--local-infile=0',self.schema],input=sql.read())
            actual=self.snapshot()
            differences=[section+':'+name for section in ('structures','data') for name in snapshot[section] if actual[section].get(name)!=snapshot[section][name]]
            require(actual==snapshot,'RESTORED_DATABASE_MISMATCH_'+','.join(differences[:6]))
            staged=self.scratch/'storage'; staged.mkdir(mode=0o700)
            evidence=verified/'evidence'
            if evidence.exists(): shutil.copytree(evidence,staged,dirs_exist_ok=True)
            validate_files(snapshot,storage_inventory(staged))
            # Same-filesystem atomic publication; cross-device raises and quarantines the schema.
            os.rename(staged,self.storage); fsync_dir(self.storage.parent)
            receipt={'status':'RESTORED_INTEGRITY_VALIDATED','backupId':outer['backupId'],'manifestSha256':expected_digest,
                     'finishedAtUtc':utc(),'restoreSeconds':round(time.monotonic()-started,3),
                     'tables':len(snapshot['tables']),'foreignKeys':snapshot['foreignKeys'],
                     'confirmedEvidence':len(snapshot['evidence']),'uploads':len(snapshot['uploads']),
                     'applicationSmoke':'PENDING','productionCertified':False}
            atomic_json(journal,receipt); return receipt
        except BaseException:
            atomic_json(journal,{'status':'QUARANTINED','backupId':outer['backupId'],'retry':'new empty disposable target required'})
            raise
