#!/usr/bin/env python3
"""Operational quiesced backup. Manual authorization mandatory; never stops/unlocks services.

No restore target or delete command exists. The disabled timer requires a fresh
maintenance authorization and external writer exclusion for each capture.
"""
import argparse,contextlib,datetime as dt,io,json,os,platform,re,resource,shutil,signal,sys,tarfile,time
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from release_contract import Refused,require,private_json,verify_tree,encoded,digest,file_digest,exclusive_lock,fsync_dir,atomic_json
from operational_io import secure_read,private_write,tool,unique
from activation_contract import utc,timestamp,exact,sha,CONFIGS,TARGET,Deadline
from activation_accounts import Accounts,CA
from recovery_snapshot import snapshot_impl,storage_copy,validate_files
from recovery_policy import validate_policy,budget,retention,BUCKET,NAMESPACE,REGION,MAX_SET
STATE=Path('/var/lib/traceflow-recovery')

def stopped():
    for unit in ('traceflow-api.service','traceflow-github-worker.service'):
        value=tool(['systemctl','show',unit,'-p','ActiveState','-p','MainPID']).decode().splitlines()
        require('MainPID=0' in value and ('ActiveState=inactive' in value or 'ActiveState=failed' in value),'BACKUP_WRITERS_RUNNING')
    for p in Path('/proc').iterdir():
        if not p.name.isdigit():continue
        try:args=(p/'cmdline').read_bytes().split(b'\0')
        except (FileNotFoundError,ProcessLookupError):continue
        require(not any(x.endswith((b'/src/server.js',b'/src/github-worker.js')) for x in args),'BACKUP_UNMANAGED_WRITER')

class Source:
    def __init__(self,accounts,manifest,release):
        self.accounts=accounts;self.schema_contract=manifest['schema'];self.release=release
    def query(self,sql):
        require(sql.startswith(('SELECT ','SHOW ')),'BACKUP_READ_ONLY')
        # JSON_ARRAY/OBJECT and tabular SHOW results are captured without column headers.
        plan=[{'id':'SNAPSHOT','sql':sql,'width':1}]
        # The reviewed framing/parser accepts arbitrary width only here; no raw output logs.
        from runtime_grants import sql_frames
        fd=os.open(self.accounts.path,os.O_RDONLY|os.O_NOFOLLOW)
        try:
            args=['/usr/bin/mysql','--defaults-file=/proc/self/fd/'+str(fd),'--no-login-paths','--protocol=TCP',
                  '--host='+TARGET['host'],'--port=3306','--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+CA,
                  '--tls-version=TLSv1.2,TLSv1.3','--skip-reconnect','--batch','--raw','--skip-column-names',
                  '--skip-auto-rehash','--binary-mode','--local-infile=0','--connect-timeout=5','--default-character-set=utf8mb4','traceflow']
            raw=tool(args,input=("SELECT JSON_ARRAY('BEGIN',CONNECTION_ID(),@@sql_notes);\nSHOW COUNT(*) WARNINGS;\n"+sql+";\nSHOW COUNT(*) WARNINGS;\nSELECT JSON_ARRAY('END',CONNECTION_ID());\nSHOW COUNT(*) WARNINGS;\n").encode(),pass_fds=(fd,),maximum=16*1024**2,timeout=35)
        finally:os.close(fd)
        lines=raw.decode('utf-8','strict').splitlines();require(raw.endswith(b'\n') and len(lines)>=5,'BACKUP_SQL_FRAME')
        start=unique(lines[0]);end=unique(lines[-2]);require(len(start)==3 and start[0]=='BEGIN' and type(start[1]) is int and start[2]==1 and
                end==['END',start[1]] and lines[1]==lines[-1]==lines[-3]=='0','BACKUP_SQL_WARNINGS_OR_SESSION')
        return lines[2:-3]
    def rows(self,sql):return [unique(x) for x in self.query(sql)]
    def identity(self):
        rows=self.rows("SELECT JSON_ARRAY(@@server_uuid,VERSION(),@@port,DATABASE(),CURRENT_USER(),CAST(CURRENT_ROLE() AS CHAR),TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),NOW()))")
        require(rows==[[TARGET['serverUuid'],'26.7.0-cloud',3306,'traceflow','traceflow_admin@%','`administrator`@`%`',0]],'BACKUP_SERVER_IDENTITY')
        grants=self.query("SHOW GRANTS FOR CURRENT_USER USING 'administrator'@'%'")
        js="import {validateMetadataVisibility} from "+json.dumps(str(self.release/'deploy/scripts/lib/migration-contract.mjs'))+";let s='';for await(const b of process.stdin)s+=b;try{validateMetadataVisibility(JSON.parse(s),{inspectorAccount:'traceflow_admin@%',inspectorRoles:[{user:'administrator',host:'%'}]},'traceflow','`administrator`@`%`');}catch{process.exitCode=1;}"
        tool(['/usr/bin/node','--input-type=module','-e',js],input=encoded(grants),timeout=10)
    def quiescent(self):
        stopped();self.accounts.state(True,True)
        require(self.query("SELECT COUNT(*) FROM performance_schema.threads WHERE TYPE='FOREGROUND' AND PROCESSLIST_ID<>CONNECTION_ID() AND PROCESSLIST_DB='traceflow'")==['0'],'BACKUP_OTHER_SESSIONS')

def capture(policy,auth_path,*,_maintenance=None):
    a=private_json(Path(auth_path).absolute())
    exact(a,{'formatVersion','backupId','issuedAt','expiresAt','releaseId','runtimeManifestSha256','configurationSha256',
             'operatorId','externalWritersControlled','maintenanceAuthorized','preActivation'},'BACKUP_AUTH_FIELDS')
    require(a['formatVersion']==1 and re.fullmatch(r'[a-f0-9]{32}',a['backupId']) and
            a['externalWritersControlled'] is True and a['maintenanceAuthorized'] is True and isinstance(a['preActivation'],bool),'BACKUP_AUTHORIZATION')
    issued,expiry=utc(a['issuedAt']),utc(a['expiresAt']);require(issued<=time.time()<expiry and 0<expiry-issued<=600,'BACKUP_WINDOW')
    deadline=Deadline(expiry);require(platform.system()=='Linux' and platform.machine()=='aarch64' and os.geteuid()==0,'NATIVE_BACKUP_REQUIRED')
    require('9.8' in Path('/etc/oracle-release').read_text() and tool(['getenforce']).strip()==b'Enforcing','BACKUP_PLATFORM')
    release=Path('/opt/traceflow/releases')/a['releaseId']
    from release_contract import release_id
    release_id(a['releaseId']);manifest=verify_tree(release,'runtime',sha(a['runtimeManifestSha256']))
    require(manifest['sourceState']=='committed' and len(manifest['schema']['migrations'])==68,'BACKUP_RELEASE')
    state=private_json(Path('/opt/traceflow/shared/release-state/state.json'))
    if _maintenance is None:
        require(state['status']=='idle' and (state['current']==a['releaseId'] or
                a['preActivation'] and state['current'] is None and state['phase'] in ('migration-complete','migration-recovered','first-activation-recovered')),'BACKUP_RELEASE_STATE')
    else:
        from backup_maintenance import Lease
        require(type(_maintenance) is Lease,'MAINTENANCE_LOCK_LEASE');_maintenance.check(a,state)
    if state['current']:
        require(os.readlink('/opt/traceflow/current')==str(release),'BACKUP_CURRENT_CHANGED')
    exact(a['configurationSha256'],CONFIGS,'BACKUP_CONFIG_INVENTORY')
    credentials=Path('/run/traceflow-recovery')/a['backupId']/'admin.cnf'
    accounts=Accounts(credentials);source=Source(accounts,manifest,release)
    destination=STATE/'sets'/a['backupId'];destination.mkdir(mode=0o700)
    scratch=Path('/run')/('traceflow-recovery-'+a['backupId']);scratch.mkdir(mode=0o700)
    try:
        with (exclusive_lock(Path('/opt/traceflow/shared/release-state/operation.lock')) if _maintenance is None else contextlib.nullcontext()):
            require(private_json(Path('/opt/traceflow/shared/release-state/state.json'))==state,'BACKUP_STATE_CHANGED')
            source.quiescent();accounts.audit(True);before=snapshot_impl(source);deadline.check()
            require(sum(x['count'] for x in before['data'].values())<=100000,'BACKUP_DATASET_REVIEW')
            storage=scratch/'evidence';storage.mkdir(mode=0o700);files=storage_copy(storage);validate_files(before,files)
            configs=scratch/'recovery';configs.mkdir(mode=0o700)
            for n in CONFIGS:
                raw=secure_read('/etc/traceflow/'+n,0,65536,0o600)
                require(digest(raw)==a['configurationSha256'][n],'BACKUP_CONFIG_CHANGED');private_write(configs/n,raw)
            private_write(configs/'mysql-ca.pem',secure_read(CA,0,65536,0o644))
            fd=os.open(credentials,os.O_RDONLY|os.O_NOFOLLOW)
            try:
                dump=scratch/'database.sql'
                with dump.open('xb') as out:
                    os.fchmod(out.fileno(),0o600)
                    tool(['/usr/bin/mysqldump','--defaults-file=/proc/self/fd/'+str(fd),'--no-login-paths','--protocol=TCP',
                          '--host='+TARGET['host'],'--port=3306','--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+CA,
                          '--tls-version=TLSv1.2,TLSv1.3','--default-character-set=utf8mb4','--single-transaction','--quick',
                          '--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF','--hex-blob','--skip-add-drop-table',
                          '--skip-add-locks','--skip-disable-keys','--skip-comments','--skip-triggers','--routines=false','--events=false','traceflow'],
                         pass_fds=(fd,),output=out,maximum=MAX_SET//2,timeout=min(180,deadline.check()))
                    out.flush();os.fsync(out.fileno())
            finally:os.close(fd)
            source.quiescent();require(before==snapshot_impl(source) and files==storage_copy(None),'BACKUP_SOURCE_CHANGED')
            for n in CONFIGS:require(digest(secure_read('/etc/traceflow/'+n,0,65536,0o600))==a['configurationSha256'][n],'BACKUP_CONFIG_CHANGED')
            private_write(scratch/'snapshot.json',encoded(before))
            inv={p.relative_to(scratch).as_posix():{'sha256':file_digest(p),'size':p.stat().st_size} for p in scratch.rglob('*') if p.is_file()}
            inner={'formatVersion':2,'application':'TraceFlow','backupId':a['backupId'],'createdAtUtc':timestamp(),'status':'COMPLETE',
                   'source':{'serverUuid':TARGET['serverUuid'],'mysqlVersion':'26.7.0-cloud','host':TARGET['host'],'ip':TARGET['expectedAddress'],'port':3306,'schema':'traceflow'},
                   'releaseId':a['releaseId'],'runtimeManifestSha256':a['runtimeManifestSha256'],'schema':manifest['schema'],
                   'consistency':'quiesced-writers-single-transaction-v1','operatorExternalWritersControlled':True,
                   'accountsLocked':True,'servicesStopped':True,'queriesWarningCount':0,'files':inv}
            private_write(scratch/'set.json',encoded(inner));archive=scratch/'payload.tar'
            with tarfile.open(archive,'w',format=tarfile.USTAR_FORMAT) as tar:
                for name in sorted([*inv,'set.json']):
                    data=(scratch/name).read_bytes();member=tarfile.TarInfo(name);member.size=len(data);member.mode=0o600;tar.addfile(member,io.BytesIO(data))
            require(archive.stat().st_size<=MAX_SET-1024*1024,'BACKUP_SIZE_REVIEW');deadline.check();source.quiescent()
            tool([policy['age'],'--encrypt','--recipient',policy['recipient'],'--output',str(destination/'payload.age'),str(archive)],timeout=60)
            public={**{k:inner[k] for k in ('formatVersion','application','backupId','createdAtUtc','source','releaseId','runtimeManifestSha256','consistency')},
                    'status':'BACKUP_CAPTURE_ENCRYPTED','createdAt':timestamp(),
                    'releaseId':a['releaseId'],'chainSha256':manifest['schema']['chainSha256'],'preActivation':a['preActivation'],
                    'recipientSha256':policy['recipientSha256'],'payloadSha256':file_digest(destination/'payload.age'),
                    'restore':'NOT_REHEARSED','externalCopy':'PENDING','innerManifestSha256':file_digest(scratch/'set.json'),
                    'archive':{'sha256':file_digest(archive),'size':archive.stat().st_size},
                    'payload':{'sha256':file_digest(destination/'payload.age'),'size':(destination/'payload.age').stat().st_size},
                    'migrationCount':68,'configurationSha256':a['configurationSha256']}
            private_write(scratch/'manifest.json',encoded(public))
            tool([policy['age'],'--encrypt','--recipient',policy['recipient'],'--output',str(destination/'manifest.json.age'),str(scratch/'manifest.json')],timeout=30)
            for p in destination.iterdir():
                p.chmod(0o600)
                with p.open('rb') as f:os.fsync(f.fileno())
            public['manifestCipherSha256']=file_digest(destination/'manifest.json.age')
            deadline.check();private_write(destination/'capture.json',encoded(public));fsync_dir(destination)
            return public
    finally:
        # Only the exclusively-created scratch is removed. Failed encrypted sets remain for review.
        require(not scratch.is_symlink() and scratch.parent==Path('/run') and scratch.stat().st_uid==0,'BACKUP_CLEANUP_OWNER')
        shutil.rmtree(scratch)
        # Volatile per-run input is consumed once; no password retained by periodic tooling.
        secure_read(credentials,0,4096,0o600);credentials.unlink();fsync_dir(credentials.parent)

def oci(policy,args):
    # OCI CLI 3.95.0 + Click emits exactly these static labels on piped stderr.
    # Accept only a complete byte match on successful exit; never arbitrary warnings.
    progress={('object','put'):b'Uploading object\n',('object','get'):b'Downloading object\n'}.get(tuple(args[:2]),b'')
    raw=tool([policy['oci'],'--auth','instance_principal','--region',REGION,'--no-retry','--connection-timeout','10',
                        '--read-timeout','60','os',*args,'--namespace-name',NAMESPACE,'--bucket-name',BUCKET],timeout=90,maximum=2*1024*1024,benign_stderr=progress)
    if args[:2]==['object','get']:
        require(not raw.strip() or unique(raw)=={'output':None},'OBJECT_GET_UNEXPECTED_OUTPUT');return None
    return unique(raw)

def publish(policy,backup_id):
    require(re.fullmatch(r'[a-f0-9]{32}',backup_id),'BACKUP_ID')
    path=STATE/'sets'/backup_id;captured=private_json(path/'capture.json')
    require(captured['status']=='BACKUP_CAPTURE_ENCRYPTED' and captured['backupId']==backup_id,'CAPTURE_REQUIRED')
    require(file_digest(path/'payload.age')==captured['payloadSha256'] and file_digest(path/'manifest.json.age')==captured['manifestCipherSha256'],'CIPHERTEXT_CHANGED')
    billing=private_json(STATE/'capacity-authorization.json')
    exact(billing,{'formatVersion','month','expiresAt','approved','externalRequestsUsed'},'CAPACITY_APPROVAL')
    month=dt.datetime.now(dt.timezone.utc).strftime('%Y-%m')
    require(billing['formatVersion']==1 and billing['approved'] is True and billing['month']==month and
            time.time()<utc(billing['expiresAt'])<=time.time()+86400,'CAPACITY_REVALIDATION_REQUIRED')
    usage_path=STATE/('requests-'+month+'.json');usage=private_json(usage_path) if usage_path.exists() else {'reserved':0}
    # Reserve a conservative budget before ANY object request; crashes do not refund it.
    require(type(billing['externalRequestsUsed']) is int and billing['externalRequestsUsed']>=0,'REQUEST_BASELINE')
    total=usage['reserved']+billing['externalRequestsUsed'];require(total+32<=1000,'BACKUP_REQUEST_BUDGET')
    atomic_json(usage_path,{'reserved':usage['reserved']+32})
    bucket=oci(policy,['bucket','get'])['data']
    require(bucket.get('public-access-type')=='NoPublicAccess' and bucket.get('storage-tier')=='Standard' and
            bucket.get('versioning')=='Disabled','BUCKET_SECURITY_CHANGED')
    objects=oci(policy,['object','list','--limit','1000','--fields','name,size'])
    names=('payload.age','manifest.json.age');size=sum((path/n).stat().st_size for n in names)
    plan=budget(objects,size,total,backup_id)
    for n in names:
        p=path/n;raw=secure_read(p,0,MAX_SET,0o600);require(raw.startswith(b'age-encryption.org/v1\n'),'CIPHERTEXT_FORMAT')
        uploaded=oci(policy,['object','put','--no-overwrite','--no-multipart','--file',str(p),'--name','backups/'+backup_id+'/'+n])
        require(isinstance(uploaded,dict) and isinstance(uploaded.get('etag'),str) and 'output' not in uploaded,'OBJECT_NOT_CREATED')
        readback=path/(n+'.readback')
        oci(policy,['object','get','--no-multipart','--if-match',uploaded['etag'],'--file',str(readback),'--name','backups/'+backup_id+'/'+n])
        require(file_digest(readback)==digest(raw) and readback.stat().st_size==len(raw),'EXTERNAL_READBACK_FAILED')
        readback.chmod(0o600)
    result={**captured,'status':'BACKUP_EXTERNAL_READBACK_PASS','externalCopy':'VERIFIED','limits':plan,
            'manifestCipherSha256':file_digest(path/'manifest.json.age')}
    private_write(path/'external.json',encoded(result));fsync_dir(path);return result

def main():
    resource.setrlimit(resource.RLIMIT_CORE,(0,0));os.umask(0o077)
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['capture','publish','periodic','retention-plan'])
    p.add_argument('--policy',required=True);p.add_argument('--authorization');p.add_argument('--backup-id')
    a=p.parse_args();require(os.geteuid()==0,'ROOT_BACKUP_OPERATOR_REQUIRED')
    policy=private_json(Path(a.policy).absolute());validate_policy(policy)
    from release_contract import trusted_path
    trusted_path(STATE,directory=True,uid=0);require(STATE.stat().st_mode&0o777==0o700,'BACKUP_STATE_MODE')
    trusted_path(STATE/'sets',directory=True,uid=0)
    for n in ('age','oci'):
        trusted_path(Path(policy[n]),uid=0);require(file_digest(policy[n])==policy[n+'Sha256'],'BACKUP_TOOL_CHANGED')
    with exclusive_lock(STATE/'operation.lock'):
        if a.operation=='retention-plan':
            rows=[private_json(p) for p in (STATE/'sets').glob('*/capture.json')]
            result=retention(rows,time.time())
        else:
            if a.operation in ('capture','periodic'):
                require(a.authorization,'BACKUP_AUTHORIZATION_REQUIRED');result=capture(policy,a.authorization);backup_id=result['backupId']
            else:backup_id=a.backup_id
            if a.operation in ('publish','periodic'):result=publish(policy,backup_id)
        print(json.dumps(result))
if __name__=='__main__':
    def stop(*_):raise Refused('BACKUP_INTERRUPTED')
    signal.signal(signal.SIGINT,stop);signal.signal(signal.SIGTERM,stop)
    try:main()
    except BaseException as e:
        code=str(e) if isinstance(e,Refused) and re.fullmatch(r'[A-Z][A-Z0-9_]{2,80}',str(e)) else 'BACKUP_OPERATION_FAILED'
        print(json.dumps({'status':'FAIL','code':code,'secretsPrinted':False}));sys.exit(1)
