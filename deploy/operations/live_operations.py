#!/usr/bin/python3
"""Operations for the clean TraceFlow installation. No legacy activation protocol.
Only backup/monitor/alert/status; restore is deliberately an offline, separate tool.
"""
import argparse, contextlib, datetime as dt, email.message, email.utils, fcntl, hashlib, json
import os, pwd, re, shlex, shutil, signal, smtplib, ssl, stat, subprocess
import tarfile, tempfile, time, uuid
from pathlib import Path

CONFIG = Path('/etc/traceflow-live/operations.json')
STATE = Path('/var/lib/traceflow-live-ops')
SCHEMA = 'traceflow_live'
PREFIX = 'production-live-v1/'
HOST = 'traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com'
SERVER_UUID = '6e94bb7f-c601-11f1-9b91-02001704771f'
CA = '/etc/pki/traceflow/mysql-ca.pem'
STORAGE = Path('/var/lib/traceflow-live/test-evidence')
CD_CURRENT = Path('/var/lib/traceflow-live-cd/current.json')
CD_RELEASES = Path('/opt/traceflow-live/releases')
IDENT = re.compile(r'[A-Za-z_][A-Za-z0-9_]{0,63}\Z')
OBJECT = re.compile(r'production-live-v1/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{32}\.tar\.gz\.age\Z')
DUMP_FLAGS = ['--default-character-set=utf8mb4', '--single-transaction', '--quick',
 '--skip-lock-tables', '--no-tablespaces', '--set-gtid-purged=OFF', '--hex-blob',
 '--skip-add-drop-table', '--skip-add-locks', '--skip-disable-keys', '--skip-comments',
 '--skip-triggers', '--routines=false', '--events=false', '--complete-insert',
 '--skip-extended-insert', '--order-by-primary']

class Refused(Exception): pass

def need(ok, code):
    if not ok: raise Refused(code)

def utc(): return dt.datetime.now(dt.timezone.utc).isoformat()
def canonical(value): return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)+'\n').encode()
def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()

def atomic(path, value):
    path=Path(path); temporary=path.with_name('.write-'+uuid.uuid4().hex)
    fd=os.open(temporary, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,'wb') as f:f.write(canonical(value));f.flush();os.fsync(f.fileno())
        os.replace(temporary,path)
        d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(d)
        finally:os.close(d)
    finally:
        if temporary.exists():temporary.unlink()

def secure(path, directory=False, owner=0):
    path=Path(path);s=path.lstat()
    need(not path.is_symlink() and s.st_uid==owner and not s.st_mode&0o077,'PRIVATE_CUSTODY')
    need(stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode),'CUSTODY_TYPE')
    for a in path.parents:
        need(not a.is_symlink() and a.stat().st_uid==0 and not a.stat().st_mode&0o022,'CUSTODY_ANCESTOR')
    return path

def config():
    secure(CONFIG);v=json.loads(CONFIG.read_bytes())
    need(v['schema']==SCHEMA and v['prefix']==PREFIX and v['formatVersion']==1,'CONFIG_IDENTITY')
    need(v['retentionDays']==14 and v['maxBucketBytes']<=8*1024**3 and v['maxPlainBytes']<=512*1024**2,'CAPACITY_POLICY')
    for k in ('age','oci'):need(sha(v[k])==v[k+'Sha256'],'TOOL_CHANGED')
    return v

def run(args, *, data=None, timeout=30, stdout=subprocess.PIPE):
    p=subprocess.run([str(x) for x in args],input=data,stdin=None if data is not None else subprocess.DEVNULL,
       stdout=stdout,stderr=subprocess.PIPE,timeout=timeout,env={**os.environ,'HOME':'/nonexistent','LANG':'C.UTF-8'})
    need(p.returncode==0,'COMMAND_'+Path(str(args[0])).name.upper().replace('-','_')+'_FAILED')
    return p.stdout

def mysql_args(tool='mysql'):
    credential=Path(os.environ['CREDENTIALS_DIRECTORY'])/'mysql-backup'
    need(credential.is_file() and not credential.is_symlink() and credential.stat().st_uid==0,'MYSQL_CREDENTIAL_CUSTODY')
    return ['/usr/bin/'+tool,'--defaults-file='+str(credential),'--no-login-paths','--protocol=TCP',
     '--host='+HOST,'--port=3306','--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+CA,
     '--tls-version=TLSv1.2,TLSv1.3']+(['--skip-reconnect','--local-infile=0','--connect-timeout=5'] if tool=='mysql' else [])

def sql(statement):
    need(statement.lstrip().startswith(('SELECT ','SHOW ')),'READONLY_SQL_REQUIRED')
    raw=run(mysql_args()+['--batch','--raw','--skip-column-names',SCHEMA],data=(statement+';\n').encode())
    need(len(raw)<=2*1024**2,'SQL_OUTPUT_LIMIT')
    return raw.decode().splitlines()

def sql_values(text):
    """Parse mysqldump scalar VALUES, never execute/evaluate source text."""
    result=[];i=0
    escapes={'0':'\0','b':'\b','n':'\n','r':'\r','t':'\t','Z':'\x1a'}
    while i<len(text):
        if text[i]=="'":
            i+=1;value=[]
            while i<len(text):
                c=text[i];i+=1
                if c=='\\':
                    need(i<len(text),'DUMP_ESCAPE');value.append(escapes.get(text[i],text[i]));i+=1
                elif c=="'":
                    if i<len(text) and text[i]=="'":value.append("'");i+=1
                    else:break
                else:value.append(c)
            else:raise Refused('DUMP_STRING')
            result.append(''.join(value))
        else:
            end=text.find(',',i);end=len(text) if end<0 else end
            v=text[i:end];i=end
            need(v=='NULL' or re.fullmatch(r'-?[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?|0x[0-9A-Fa-f]+',v,re.I),'DUMP_SCALAR')
            result.append(None if v=='NULL' else v)
        if i<len(text):need(text[i]==',','DUMP_SEPARATOR');i+=1
    return result

def dump_manifest(path):
    tables={};current=None;ddl=[];references=[];uploads=[];migrations=[]
    with Path(path).open(encoding='utf8') as f:
        for line in f:
            need(len(line)<=8*1024**2,'DUMP_LINE_LIMIT')
            m=re.match(r'^CREATE TABLE `([A-Za-z_][A-Za-z0-9_]*)` \(',line)
            if m:
                current=m[1];need(current not in tables,'DUPLICATE_TABLE');ddl=[line];continue
            if current:
                ddl.append(line)
                if line.rstrip().endswith(';'):
                    statement=''.join(ddl)
                    normalized=re.sub(r'AUTO_INCREMENT=[0-9]+','AUTO_INCREMENT=<counter>',statement)
                    tables[current]={'structureSha256':hashlib.sha256(normalized.encode()).hexdigest(),'rowHashes':[],
                      'foreignKeys':len(re.findall(r'FOREIGN KEY \(',statement))}
                    current=None
                continue
            m=re.match(r'^INSERT INTO `([A-Za-z_][A-Za-z0-9_]*)` \((.+)\) VALUES \((.*)\);\n?$',line)
            if not m:continue
            name=m[1];need(name in tables,'INSERT_TABLE')
            tables[name]['rowHashes'].append(hashlib.sha256(line.rstrip('\n').encode()).digest())
            if name in ('TestEvidence','EvidenceUpload','_prisma_migrations'):
                columns=re.findall(r'`([A-Za-z_][A-Za-z0-9_]*)`',m[2]);values=sql_values(m[3]);need(len(columns)==len(values),'DUMP_COLUMNS')
                row=dict(zip(columns,values))
                if name=='TestEvidence':references.append({'storageKey':row['storageKey'],'sha256':row['sha256'],'sizeBytes':int(row['sizeBytes'])})
                elif name=='EvidenceUpload' and row['status'] in ('OPEN','FINALIZING'):
                    for upload in json.loads(row['filesJson']):
                        for part in upload['parts'].values():uploads.append({'storageKey':'.uploads/'+row['id']+'/'+part['key'],'sha256':part['sha256'],'sizeBytes':int(part['sizeBytes'])})
                elif name=='_prisma_migrations':
                    need(row['finished_at'] is not None and row['rolled_back_at'] is None,'INCOMPLETE_MIGRATION')
                    migrations.append({'name':row['migration_name'],'sha256':row['checksum']})
    need(current is None and tables,'DUMP_STRUCTURE')
    for v in tables.values():
        rows=v.pop('rowHashes');v.update(rows=len(rows),dataSha256=hashlib.sha256(b''.join(sorted(rows))).hexdigest())
    return {'tables':tables,'migrations':sorted(migrations,key=lambda x:x['name']), 'evidence':references,'uploadParts':uploads}

def inventory(root):
    result={};uid=pwd.getpwnam('traceflow-live').pw_uid
    for p in sorted(root.rglob('*')):
        s=p.lstat();need(not p.is_symlink() and s.st_uid==uid and not s.st_mode&0o077,'STORAGE_CUSTODY')
        if stat.S_ISDIR(s.st_mode):continue
        need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'STORAGE_FILE_TYPE')
        result[str(p.relative_to(root))]=(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
    return result

def copy_storage(destination, maximum):
    before=inventory(STORAGE);need(sum(x[2] for x in before.values())<=maximum,'STORAGE_CAPACITY')
    files={}
    for name,observed in before.items():
        p=STORAGE/name;target=destination/name;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW);h=hashlib.sha256();n=0
        with os.fdopen(fd,'rb') as source,target.open('xb') as dest:
            for b in iter(lambda:source.read(1024*1024),b''):h.update(b);n+=len(b);dest.write(b)
            s=os.fstat(source.fileno());need((s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)==observed and n==observed[2],'STORAGE_CHANGED_DURING_BACKUP')
        target.chmod(0o600);files[name]={'sizeBytes':n,'sha256':h.hexdigest()}
    need(inventory(STORAGE)==before,'STORAGE_CHANGED_DURING_BACKUP')
    return files

def validate_references(snapshot,files):
    for row in snapshot['evidence']+snapshot['uploadParts']:
        name=row['storageKey'];need(not name.startswith('/') and '..' not in Path(name).parts,'REFERENCE_PATH')
        need(files.get(name)=={'sizeBytes':row['sizeBytes'],'sha256':row['sha256']},'REFERENCED_FILE_MISSING_OR_CORRUPT')

def oci(cfg,args):
    # Instance identity is already authorized for this bucket; never use Vault key for Object Storage.
    path=STATE/'object-requests.json';month=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m')
    usage=json.loads(path.read_bytes()) if path.exists() else {'month':month,'requests':0}
    if usage['month']!=month:usage={'month':month,'requests':0}
    need(usage['requests']+4<=cfg['maxObjectRequestsPerMonth'],'OBJECT_REQUEST_BUDGET')
    usage['requests']+=4;atomic(path,usage)
    raw=run([cfg['oci'],'--auth','instance_principal','--region',cfg['region'],'--no-retry','--connection-timeout','5','--read-timeout','30','os']+args,timeout=60)
    return json.loads(raw) if raw and raw.strip() else {}

def bucket_args(cfg):return ['--namespace-name',cfg['namespace'],'--bucket-name',cfg['bucket']]

def object_rows(cfg):
    value=oci(cfg,['object','list',*bucket_args(cfg),'--all','--fields','name,size,timeCreated'])
    need(not value.get('next-start-with') and not value.get('prefixes'),'INCOMPLETE_BUCKET_LIST')
    return value['data']

def retire(cfg,rows):
    """Only objects under the new exact prefix. Legacy objects are never candidates."""
    own=sorted([r for r in rows if OBJECT.fullmatch(r['name'])],key=lambda x:x['time-created'],reverse=True)
    for row in own[2:]:
        age=time.time()-dt.datetime.fromisoformat(row['time-created'].replace('Z','+00:00')).timestamp()
        if age>cfg['retentionDays']*86400:
            etag=row.get('etag') or oci(cfg,['object','head',*bucket_args(cfg),'--name',row['name']]).get('etag')
            need(etag,'RETENTION_ETAG')
            oci(cfg,['object','delete',*bucket_args(cfg),'--name',row['name'],'--if-match',etag,'--force'])
    for p in (STATE/'backups').glob('*.tar.gz.age'):
        if time.time()-p.stat().st_mtime>2*86400:p.unlink()

class HashingWriter:
    def __init__(self,writer):self.writer=writer;self.hash=hashlib.sha256();self.size=0
    def write(self,b):self.hash.update(b);self.size+=len(b);return self.writer.write(b)
    def flush(self):return self.writer.flush()

def snapshot_contract(snapshot,cfg):
    """Recognize a reviewed complete schema, never a fixed migration quantity."""
    contracts=cfg.get('schemaContracts')
    if contracts is None:
        expected=json.loads((Path(cfg['release'])/'manifest.json').read_bytes())['schema']['migrations']
        contracts=[{'schemaSha256':sha(Path(cfg['release'])/'backend/prisma/schema.prisma'),'migrations':expected,'tables':61,'foreignKeys':116}]
    need(isinstance(contracts,list) and contracts,'SCHEMA_CONTRACT_REQUIRED')
    observed=snapshot['migrations'];names=[m['name'] for m in observed]
    need(len(set(names))==len(names),'MIGRATION_DUPLICATE')
    matches=[c for c in contracts if sorted(c['migrations'],key=lambda m:m['name'])==observed]
    need(len(matches)==1,'MIGRATION_SCHEMA_CHAIN')
    contract=matches[0]
    need(len(snapshot['tables'])==contract['tables'] and sum(v['foreignKeys'] for v in snapshot['tables'].values())==contract['foreignKeys'],'FOREIGN_KEY_SCHEMA_CHAIN')
    if 'tableNames' in contract:need(sorted(snapshot['tables'])==sorted(contract['tableNames']),'TABLE_SCHEMA_CHAIN')
    return contract

def application_identity(cfg,contract):
    state=CD_CURRENT
    if not state.exists():return {'releaseId':Path(cfg['release']).name,'descriptorSha256':cfg['descriptorSha256']}
    root=Path(json.loads(state.read_bytes())['currentRelease'])
    need(root.parent==CD_RELEASES and root.stat().st_uid==0 and not root.is_symlink(),'APPLICATION_RELEASE_CUSTODY')
    manifest=root/'cd-manifest.json';value=json.loads(manifest.read_bytes())
    need(value.get('sourceState')=='committed','APPLICATION_SOURCE_STATE')
    exact=value['migrations']==contract['migrations'] and value['schemaSha256']==contract.get('schemaSha256')
    prior=contract.get('compatiblePriorApplications',{}).get(value['commit'])
    target={m['name']:m['sha256'] for m in contract['migrations']}
    compatible=prior==value['schemaSha256'] and all(target.get(m['name'])==m['sha256'] for m in value['migrations'])
    need(exact or compatible,'APPLICATION_SCHEMA_BINDING')
    return {'releaseId':value['commit'],'descriptorSha256':sha(manifest),'packagingKind':value['kind']}

def backup(cfg):
    started=time.monotonic();ident=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
    object_name=PREFIX+ident+'.tar.gz.age';need(OBJECT.fullmatch(object_name),'OBJECT_NAME')
    parent=STATE/'backups';parent.mkdir(mode=0o700,exist_ok=True)
    target=parent/(ident+'.tar.gz.age');receipt={'id':ident,'status':'STARTED','startedAt':utc(),'object':object_name}
    atomic(STATE/'last-attempt.json',receipt)
    receipt['stage']='database-snapshot';atomic(STATE/'last-attempt.json',receipt)
    identity=json.loads(sql('SELECT JSON_ARRAY(@@server_uuid,VERSION(),DATABASE(),CURRENT_USER())')[0])
    need(identity[0]==SERVER_UUID and identity[2:]==[SCHEMA,'tf_live_backup@10.20.1.184'],'DATABASE_IDENTITY')
    bucket=oci(cfg,['bucket','get','--namespace-name',cfg['namespace'],'--name',cfg['bucket']])['data']
    need(bucket['public-access-type']=='NoPublicAccess' and bucket['storage-tier']=='Standard','PRIVATE_BUCKET_REQUIRED')
    need(sql("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_TYPE!='BASE TABLE' OR ENGINE!='InnoDB')")==['0'],'TRANSACTIONAL_TABLES_REQUIRED')
    need(sql("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()")==['0'],'UNSUPPORTED_TRIGGERS')
    need(sql("SELECT COUNT(*) FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()")==['0'],'UNSUPPORTED_ROUTINES')
    need(sql("SELECT COUNT(*) FROM INFORMATION_SCHEMA.EVENTS WHERE EVENT_SCHEMA=DATABASE()")==['0'],'UNSUPPORTED_EVENTS')
    rows=object_rows(cfg);total=sum(r['size'] for r in rows)
    need(total+cfg['maxPlainBytes']<cfg['maxBucketBytes'],'BUCKET_CAPACITY')
    with tempfile.TemporaryDirectory(prefix='capture-',dir='/run/traceflow-live-backup') as work:
        work=Path(work);dump=work/'database.sql'
        with dump.open('xb') as output:run(mysql_args('mysqldump')+DUMP_FLAGS+[SCHEMA],stdout=output,timeout=300)
        need(0<dump.stat().st_size<cfg['maxPlainBytes'],'DATABASE_CAPACITY')
        snapshot=dump_manifest(dump)
        contract=snapshot_contract(snapshot,cfg)
        files=copy_storage(work/'storage',cfg['maxPlainBytes']-dump.stat().st_size)
        validate_references(snapshot,files)
        private=work/'configuration';private.mkdir(mode=0o700)
        sources=[Path('/etc/traceflow-live')/n for n in ('runtime.env','api.env','github-worker.env','operations.json')]
        sources += [Path(CA),Path('/etc/nginx/nginx.conf'),Path('/etc/nginx/conf.d/traceflow.conf')]
        sources += [Path('/etc/nginx/ssl/traceflow-origin.pem'),Path('/etc/nginx/ssl/traceflow-origin.key'),Path('/usr/local/libexec/traceflow-live-ops.py')]
        sources += list(Path('/etc/nginx/traceflow-live').glob('*.conf'))
        sources += sorted(Path('/etc/systemd/system').glob('traceflow-live-*.service'))
        sources += sorted(Path('/etc/systemd/system').glob('traceflow-live-*.timer'))
        sources += sorted(Path('/etc/systemd/system').glob('traceflow-live-*.service.d/*.conf'))
        sources += [p for p in [Path('/etc/traceflow-live/cd.json'),Path('/var/lib/traceflow-live-cd/current.json')] if p.exists()]
        retention=Path('/usr/local/libexec/traceflow-live-retention.mjs')
        if retention.exists():sources.append(retention)
        sources += [p for p in [Path('/etc/firewalld/firewalld.conf'),Path('/etc/firewalld/direct.xml'),Path('/etc/firewalld/zones/public.xml'),Path('/etc/systemd/journald.conf.d/60-traceflow-retention.conf'),Path('/etc/logrotate.d/nginx'),Path('/etc/logrotate.d/traceflow-live-ops')] if p.exists()]
        configurations={}
        for source in sources:
            need(source.is_file() and not source.is_symlink() and source.stat().st_uid==0 and not source.stat().st_mode&0o022,'CONFIG_CUSTODY')
            name=str(source).lstrip('/');p=private/name;p.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
            p.write_bytes(source.read_bytes());p.chmod(0o600);configurations[name]=sha(p)
        manifest={'formatVersion':1,'kind':'traceflow-clean-online-backup','id':ident,'capturedAt':utc(),'source':identity[:3],
          **application_identity(cfg,contract),'databaseSha256':sha(dump),
          'schemaContractSha256':hashlib.sha256(canonical(contract)).hexdigest(),'snapshot':snapshot,'files':files,'configurationSha256':configurations,
          'consistency':'mysqldump-single-transaction-innoDB-with-validated-storage-references-v1'}
        (work/'manifest.json').write_bytes(canonical(manifest))
        cipher=target.open('xb')
        process=subprocess.Popen([cfg['age'],'-r',cfg['recipient']],stdin=subprocess.PIPE,stdout=cipher,stderr=subprocess.PIPE)
        stream=HashingWriter(process.stdin)
        try:
            with tarfile.open(fileobj=stream,mode='w|gz',format=tarfile.PAX_FORMAT) as archive:
                for p in sorted(work.rglob('*')):
                    if p.is_file():archive.add(p,arcname=str(p.relative_to(work)),recursive=False)
            stream.flush();process.stdin.close();need(process.wait(30)==0,'ENCRYPTION_FAILED')
        finally:
            if process.poll() is None:process.kill();process.wait()
            process.stderr.close();cipher.flush();os.fsync(cipher.fileno());cipher.close()
        need(0<target.stat().st_size<cfg['maxPlainBytes'],'CIPHER_CAPACITY')
        need(sum(r['size'] for r in rows)+target.stat().st_size<cfg['maxBucketBytes'],'BUCKET_CAPACITY')
        receipt['stage']='encrypted-publication';atomic(STATE/'last-attempt.json',receipt)
        oci(cfg,['object','put',*bucket_args(cfg),'--name',object_name,'--file',str(target),'--no-overwrite','--no-multipart','--content-type','application/octet-stream'])
        receipt['stage']='external-readback';atomic(STATE/'last-attempt.json',receipt)
        readback=work/'readback.age'
        oci(cfg,['object','get',*bucket_args(cfg),'--name',object_name,'--file',str(readback)])
        need(sha(readback)==sha(target),'EXTERNAL_READBACK_MISMATCH')
        receipt.update(status='SUCCESS',finishedAt=utc(),seconds=round(time.monotonic()-started,3),cipherBytes=target.stat().st_size,
          cipherSha256=sha(target),archiveSha256=stream.hash.hexdigest(),manifestSha256=sha(work/'manifest.json'),
          tableCount=len(snapshot['tables']),migrationCount=len(snapshot['migrations']),foreignKeys=sum(v['foreignKeys'] for v in snapshot['tables'].values()),fileCount=len(files),
          externalReadback=True,configurationFiles=len(configurations),databaseBytes=dump.stat().st_size)
        # Receipt contains no business data, keys, sessions or plaintext configurations.
        atomic(parent/(ident+'.json'),receipt);atomic(STATE/'last-backup.json',receipt)
    retire(cfg,rows)
    atomic(STATE/'last-attempt.json',receipt)
    return receipt

def environment(path):
    result={}
    for line in Path(path).read_text().splitlines():
        if not line or line.startswith('#'):continue
        k,v=line.split('=',1);tokens=shlex.split(v,comments=False,posix=True)
        need(len(tokens)<=1,'ENV_FORMAT');result[k]=tokens[0] if tokens else ''
    return result

def alert(cfg,code,*,test=False,force=False):
    need(re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}',code),'ALERT_CODE')
    path=STATE/'alert-state.json';state=json.loads(path.read_bytes()) if path.exists() else {}
    if not force and time.time()-state.get(code,0)<3600:return {'status':'RATE_LIMITED','code':code}
    values=environment('/etc/traceflow-live/runtime.env')
    message=email.message.EmailMessage();message['From']=values['EMAIL_FROM'];message['To']=cfg['alertTo']
    message['Subject']='[TraceFlow] '+('TESTE CONTROLADO — ' if test else '')+code
    message['Message-ID']=email.utils.make_msgid(domain='traceflow.dev')
    message.set_content('TraceFlow — '+code+'\nUTC: '+utc()+'\n'+
       ('Teste de entrega autorizado, sem falha provocada na produção.\n' if test else 'Verifique o runbook e o status protegido na VM.\n')+
       'Runbook: docs/runbooks/OCI_LIVE_OPERATIONS.md\nSem dados pessoais ou credenciais neste alerta.\n')
    context=ssl.create_default_context()
    with smtplib.SMTP(values['SMTP_HOST'],int(values['SMTP_PORT']),timeout=15) as smtp:
        smtp.ehlo();smtp.starttls(context=context);smtp.ehlo();smtp.login(values['SMTP_USER'],values['SMTP_PASSWORD'])
        rejected=smtp.send_message(message);need(not rejected,'SMTP_RECIPIENT_REJECTED')
    state[code]=time.time();atomic(path,state)
    result={'status':'SMTP_ACCEPTED','test':test,'code':code,'at':utc(),'messageId':message['Message-ID'],'tlsVerified':True}
    atomic(STATE/('alert-test.json' if test else 'last-alert.json'),result);return result

def http(url):
    p=subprocess.run(['curl','--silent','--show-error','--max-time','10','--output','/dev/null','--write-out','%{http_code} %{time_total}',url],capture_output=True)
    if p.returncode:return {'status':0,'seconds':None}
    status,seconds=p.stdout.decode().split();return {'status':int(status),'seconds':float(seconds)}

def log_metrics(path,now):
    samples=[];errors=0
    with Path(path).open('rb') as f:
        f.seek(max(0,Path(path).stat().st_size-4*1024**2))
        for line in f:
            try:
                r=json.loads(line);at=dt.datetime.fromisoformat(r['time']).timestamp()
                if now-300<=at<=now:
                    samples.append(float(r['duration']));errors+=int(int(r['status'])>=500)
            except (ValueError,KeyError,TypeError):continue
    samples.sort();n=len(samples)
    return {'requests5m':n,'http5xx5m':errors,'p95Seconds5m':samples[min(n-1,int(n*.95))] if n else None}

def scheduled_job_metrics():
    """Read-only lease age and sanitized journal event counters for the existing worker."""
    directory=run(['systemctl','show','traceflow-live-worker','--property=WorkingDirectory','--value']).decode().strip()
    if not (Path(directory)/'src/jobs/job-runner.js').is_file():return {'enabled':False},[]
    need(environment('/etc/traceflow-live/github-worker.env').get('JOBS_ENABLED')=='true','JOBS_CONFIGURATION')
    expected={'notifications-due':2700,'github-event-dispatch':900,'traceability-notice-dispatch':900,'traceability-alerts':10800}
    rows=[json.loads(r) for r in sql('SELECT JSON_ARRAY(name,TIMESTAMPDIFF(SECOND,acquiredAt,UTC_TIMESTAMP())) FROM ScheduledJobLease')]
    ages={name:age for name,age in rows if name in expected}
    since=int(run(['systemctl','show','traceflow-live-worker','--property=ActiveEnterTimestampMonotonic','--value']).strip())/1e6
    warming=time.monotonic()-since<90
    failures=[]
    if not warming and (set(ages)!=set(expected) or any(ages[n]>limit for n,limit in expected.items() if n in ages)):failures.append('SCHEDULED_JOBS_STALE')
    log=run(['journalctl','--unit=traceflow-live-worker','--since=-15min','--lines=1000','--output=json','--no-pager'])
    failed=0
    for line in log.decode().splitlines():
        try:
            message=json.loads(json.loads(line)['MESSAGE'])
            if message.get('event') in ('scheduled_job_failed','scheduled_job_lease_lost','scheduled_job_lease_renew_failed') or (message.get('event')=='scheduled_job_completed' and message.get('level') in ('warn','error')):failed+=1
        except (ValueError,KeyError,TypeError):continue
    if failed:failures.append('SCHEDULED_JOB_FAILED')
    return {'enabled':True,'warming':warming,'leaseAgeSeconds':ages,'failedEvents15m':failed},failures

def monitor(cfg):
    now=time.time();failures=[];metrics={'at':utc(),'https':http('https://traceflow.dev/'),'api':http('http://127.0.0.1:3001/health/ready')}
    if metrics['https']['status']!=200:failures.append('HTTPS_UNAVAILABLE')
    if metrics['api']['status']!=200:failures.append('API_NOT_READY')
    if (metrics['https']['seconds'] or 0)>2:failures.append('PUBLIC_PROBE_SLOW')
    try:
        identity=json.loads(sql('SELECT JSON_ARRAY(@@server_uuid,DATABASE())')[0]);need(identity==[SERVER_UUID,SCHEMA],'DB_IDENTITY')
        heartbeat=json.loads(sql('SELECT JSON_ARRAY(COUNT(*),COALESCE(TIMESTAMPDIFF(SECOND,MAX(heartbeatAt),UTC_TIMESTAMP()),999999)) FROM GitHubSchedulerWorker')[0])
        metrics.update(mysql=True,workerCount=heartbeat[0],workerHeartbeatAgeSeconds=heartbeat[1])
        failed=int(sql("SELECT COUNT(*) FROM GitHubSyncRun WHERE status='FAILED' AND finishedAt>UTC_TIMESTAMP()-INTERVAL 15 MINUTE")[0]);metrics['failedGitHubJobs15m']=failed
        if failed:failures.append('GITHUB_JOB_FAILED')
        if heartbeat[0]<1 or heartbeat[1]>90:failures.append('WORKER_HEARTBEAT_STALE')
    except Exception:metrics['mysql']=False;failures.append('MYSQL_UNAVAILABLE')
    try:
        metrics['scheduledJobs'],jobFailures=scheduled_job_metrics();failures.extend(jobFailures)
    except Exception:failures.append('SCHEDULED_JOBS_MONITOR_FAILED')
    for role in ('api','worker'):
        unit='traceflow-live-'+role+'.service'
        p=subprocess.run(['systemctl','is-active',unit],capture_output=True,text=True)
        metrics[role+'UnitActive']=p.returncode==0
        if p.returncode:failures.append(role.upper()+'_UNIT_INACTIVE')
    disk=shutil.disk_usage('/');metrics['diskUsedPercent']=round(disk.used/disk.total*100,2)
    memory={k:int(v.split()[0]) for k,v in (line.split(':',1) for line in Path('/proc/meminfo').read_text().splitlines())}
    metrics['memoryAvailablePercent']=round(memory['MemAvailable']/memory['MemTotal']*100,2)
    if metrics['diskUsedPercent']>=85:failures.append('DISK_SPACE_LOW')
    if metrics['memoryAvailablePercent']<10:failures.append('MEMORY_LOW')
    metrics.update(log_metrics('/var/log/nginx/traceflow-access.log',now))
    if metrics['http5xx5m']>=5 and metrics['http5xx5m']/max(1,metrics['requests5m'])>=.05:failures.append('HTTP_ERROR_RATE_HIGH')
    if metrics['requests5m']>=20 and metrics['p95Seconds5m']>2:failures.append('HTTP_P95_HIGH')
    backupFailed=subprocess.run(['systemctl','is-failed','--quiet','traceflow-live-backup.service']).returncode==0
    if backupFailed:failures.append('BACKUP_JOB_FAILED')
    if subprocess.run(['systemctl','is-failed','--quiet','traceflow-live-retention.service']).returncode==0:failures.append('RETENTION_JOB_FAILED')
    last=STATE/'last-backup.json'
    metrics['backupAgeHours']=(now-dt.datetime.fromisoformat(json.loads(last.read_bytes())['finishedAt']).timestamp())/3600 if last.exists() else None
    if metrics['backupAgeHours'] is None or metrics['backupAgeHours']>26:failures.append('BACKUP_STALE')
    guard=CD_CURRENT.with_name('schema-transition-in-progress');metrics['schemaTransitionPending']=guard.exists()
    if guard.exists():
        state=run(['systemctl','show','traceflow-live-cd','--property=ActiveState','--value']).decode().strip()
        if state not in ('activating','active'):failures.append('SCHEMA_TRANSITION_INCOMPLETE')
    previous=json.loads((STATE/'metrics.json').read_bytes()) if (STATE/'metrics.json').exists() else {}
    metrics['consecutiveFailures']={c:previous.get('consecutiveFailures',{}).get(c,0)+1 for c in failures}
    metrics['failures']=failures
    atomic(STATE/'metrics.json',metrics)
    history=STATE/'metrics.jsonl'
    need(not history.exists() or history.stat().st_size<64*1024**2,'METRICS_ROTATION_OVERDUE')
    with history.open('ab') as f:f.write(canonical(metrics))
    for code,count in metrics['consecutiveFailures'].items():
        if count>=3:alert(cfg,code)
    return {'status':'HEALTHY' if not failures else 'DEGRADED','metrics':metrics}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('operation',choices=['backup','monitor','alert-test','alert-backup','alert-monitor','alert-retention','status']);args=parser.parse_args()
    need(os.geteuid()==0,'ROOT_REQUIRED');os.umask(0o077);cfg=config();secure(STATE,True)
    lock=STATE/('backup.lock' if args.operation=='backup' else 'monitor.lock')
    with lock.open('a+') as f:
        try:fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise Refused('OPERATION_BUSY')
        if args.operation=='backup':result=backup(cfg)
        elif args.operation=='monitor':result=monitor(cfg)
        elif args.operation=='alert-test':result=alert(cfg,'S2_10_ALERT_DELIVERY_TEST',test=True,force=True)
        elif args.operation=='alert-backup':result=alert(cfg,'BACKUP_JOB_FAILED')
        elif args.operation=='alert-monitor':result=alert(cfg,'MONITOR_JOB_FAILED')
        elif args.operation=='alert-retention':result=alert(cfg,'RETENTION_JOB_FAILED')
        else:result={p.name:json.loads(p.read_bytes()) for p in [STATE/'last-backup.json',STATE/'metrics.json'] if p.exists()}
    print(json.dumps(result,sort_keys=True))

if __name__=='__main__':
    def interrupted(*_):raise Refused('INTERRUPTED')
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    try:main()
    except BaseException as e:
        if isinstance(e,SystemExit):raise
        code=str(e) if isinstance(e,Refused) else type(e).__name__
        code=code if re.fullmatch('[A-Z][A-Z0-9_]{0,100}',code) else type(e).__name__
        result={'status':'FAILED','code':code,'at':utc(),'secretsPrinted':False}
        if STATE.is_dir():
            with contextlib.suppress(Exception):
                atomic(STATE/'last-failure.json',result)
                if len(__import__('sys').argv)>1 and __import__('sys').argv[1]=='backup':
                    attempt=STATE/'last-attempt.json'
                    if attempt.exists():
                        previous=json.loads(attempt.read_bytes());previous.update(status='FAILED',failedAt=result['at'],code=code)
                        atomic(attempt,previous)
                        atomic(STATE/'backups'/(previous['id']+'.failure.json'),previous)
        print(json.dumps(result));raise SystemExit(1)
