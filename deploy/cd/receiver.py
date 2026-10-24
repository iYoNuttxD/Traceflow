#!/usr/bin/env python3
"""Pull-only clean CD receiver. No inbound port, cloud credentials, legacy protocol or legacy DB writes. Explicit reviewed schema transitions use a separate Prisma sandbox."""
import resource
import base64,datetime as dt,fcntl,hashlib,importlib.util,json,os,re,shutil,signal,subprocess,sys,time,urllib.request
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from contract import need,sha,canonical,unpack,schema_gate,promote
from migrations import transition
REPO='iYoNuttxD/Traceflow';WORKFLOW='.github/workflows/oci-cd.yml'
CONFIG=Path('/etc/traceflow-live/cd.json');STATE=Path('/var/lib/traceflow-live-cd')
RELEASES=Path('/opt/traceflow-live/releases');FRONTENDS=Path('/var/www/traceflow-live-releases')
STATUS=Path('/var/www/traceflow-live-deploy-status')
CURRENT_KEYS={'currentRelease','frontendRoot','nginxSha256','proxySha256'}
# Accept only codes emitted by the reviewed migrator; never copy arbitrary child fields.
MIGRATOR_CODES=set(('ROOT_REQUIRED MIGRATION_RELEASE MIGRATOR_CUSTODY MIGRATOR_IDENTITY '
 'MIGRATOR_TLS_CONNECTION MIGRATOR_DATABASE_IDENTITY PRISMA_CLI_IDENTITY '
 'MIGRATOR_CONNECTION_BUDGET MIGRATOR_PRIVILEGE_SCOPE MIGRATOR_PRIVILEGES '
 'SCHEMA_DRIFT_OR_INTROSPECTION_FAILED PREVIOUS_RELEASE_CUSTODY '
 'PRISMA_DEPLOY_FAILED_NO_RETRY MIGRATION_ARGUMENTS MIGRATION_EXECUTION_FAILED '
 'MIGRATOR_MYSQL_TIMEOUT MIGRATOR_SCHEMA_TIMEOUT MIGRATOR_DEPLOY_TIMEOUT').split())
SYSTEMD_RESULTS={'success','exit-code','signal','core-dump','timeout','watchdog','oom-kill','resources','start-limit-hit','protocol'}
def migration_unit_evidence(command):
 unit=next((v.split('=',1)[1]+'.service' for v in command if re.fullmatch('--unit=traceflow-live-cd-migrate-(check-)?[0-9]+',v)),None)
 if unit is None:return {}
 try:
  p=subprocess.run(['/usr/bin/journalctl','--no-pager','--unit='+unit,'--lines=12','--output=json','--output-fields=MESSAGE,UNIT,_SYSTEMD_UNIT,_SYSTEMD_INVOCATION_ID'],capture_output=True,timeout=5,env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'})
  if p.returncode or len(p.stdout)>65536:return {}
  return migration_journal_evidence(p.stdout,unit)
 except (OSError,subprocess.TimeoutExpired):return {}

def migration_journal_evidence(output,unit):
 result={}
 for line in output.splitlines():
  try:entry=json.loads(line)
  except (ValueError,UnicodeError):continue
  if not isinstance(entry,dict) or unit not in (entry.get('UNIT'),entry.get('_SYSTEMD_UNIT')):continue
  message=entry.get('MESSAGE','')
  if not isinstance(message,str):continue
  match=re.search(r'Main process exited, code=(exited|killed|dumped), status=([0-9]{1,3})/[A-Z_]+',message)
  if match and int(match[2])<=255:result.update(execMainCode=match[1],execMainStatus=int(match[2]),journalExecutionObserved=True)
  match=re.search(r"Failed with result '([a-z-]+)'",message)
  if match and match[1] in SYSTEMD_RESULTS:result['unitResult']=match[1]
 return result

def migration_diagnostic(stdout,stderr,exit_code,timed_out=False,unit_evidence=None):
 def data(value):return value if isinstance(value,bytes) else b''
 stdout,stderr=data(stdout),data(stderr)
 result={'formatVersion':1,'exitCode':exit_code,'category':'unknown','code':'MIGRATOR_EXECUTION_UNCLASSIFIED',
  'childExecutionObserved':False,'unitExecutionObserved':False,'stdoutSha256':hashlib.sha256(stdout).hexdigest(),'stderrSha256':hashlib.sha256(stderr).hexdigest()}
 if unit_evidence:result.update(unit_evidence)
 # systemd-run --wait reports a fixed summary on stderr even after --collect.
 match=re.search(rb'Main processes terminated with: code=(exited|killed|dumped)/status=([0-9]{1,3}|HUP|INT|QUIT|ILL|ABRT|FPE|KILL|SEGV|PIPE|ALRM|TERM|XCPU|XFSZ|SYS|BUS|USR1|USR2)(?:/|\s|$)',stderr)
 if match:
  result.update(childExecutionObserved=True,unitExecutionObserved=True,execMainCode=match[1].decode(),execMainStatus=int(match[2]) if match[2].isdigit() else match[2].decode())
  result.update(category='child-execution',code='MIGRATOR_CHILD_PROCESS_FAILED')
 match=re.search(rb'Finished with result: ([a-z-]+)',stderr)
 if match and match[1].decode() in SYSTEMD_RESULTS:result['unitResult']=match[1].decode()
 if 'execMainStatus' in result and not result['childExecutionObserved']:
  result.update(childExecutionObserved=True,unitExecutionObserved=True,category='child-execution',code='MIGRATOR_CHILD_PROCESS_FAILED')
 if result.get('execMainStatus') in (203,216,217,218,224,225,226,227,228,229,231,232,233,238,243):
  result.update(childExecutionObserved=False,category='unit-setup',code='MIGRATOR_UNIT_SETUP_FAILED')
 for reason,pattern in [('ACCESS_DENIED',b'Permission denied'),('ACCESS_DENIED',b'Access denied'),('INVALID_ARGUMENT',b'Invalid argument'),('UNKNOWN_ASSIGNMENT',b'Unknown assignment'),('UNKNOWN_PROPERTY',b'Unknown property'),('NOT_TRANSIENT_SETTABLE',b'cannot be set transiently'),('BUS_CONNECTION_FAILED',b'Failed to connect to bus'),('JOB_CONFLICT',b'Transaction is destructive'),('BUS_CONNECTION_RESET',b'Connection reset by peer')]:
  if pattern in stderr:result['systemdReason']=reason;break
 for prop in ('BindsTo','PartOf','LoadCredentialEncrypted','ProtectSystem','NoNewPrivileges','InaccessiblePaths','MemoryMax','MemorySwapMax','RuntimeMaxSec','TimeoutStopSec','KillMode','Type'):
  if re.search(rb'(?:Unknown assignment|Unknown property|Cannot set property|Failed to set property)[^\n]{0,80}\b'+prop.encode()+rb'\b',stderr):result['unitProperty']=prop;break
 if b'Failed to find executable ' in stderr:
  result.update(category='unit-creation',code='MIGRATOR_EXECUTABLE_UNAVAILABLE')
 elif b'Failed to set unit properties:' in stderr:
  result.update(category='unit-creation',code='MIGRATOR_UNIT_PROPERTY_REFUSED')
 elif b'Failed to start transient service unit:' in stderr:
  result.update(category='unit-creation',code='MIGRATOR_TRANSIENT_START_FAILED')
 for line in stdout.splitlines():
  try:value=json.loads(line)
  except (ValueError,UnicodeError):continue
  if not isinstance(value,dict):continue
  status=value.get('status');code=value.get('code')
  if status=='BLOCKED' and isinstance(code,str) and code in MIGRATOR_CODES:
   result.update(childExecutionObserved=True,unitExecutionObserved=True,childStatus=status,childCode=code,code=code,category='validation')
   if code in ('MIGRATOR_TLS_CONNECTION','MIGRATOR_DATABASE_IDENTITY'):result['category']='mysql-connection'
   elif code in ('MIGRATOR_CUSTODY','MIGRATOR_IDENTITY'):result['category']='unit-setup'
   elif code.endswith('_TIMEOUT'):result['category']='timeout-or-resource'
  elif status in ('MIGRATOR_PREFLIGHT_PASS','PRISMA_DEPLOY_PASS','PRISMA_DEPLOY_FAILED'):
   result.update(childExecutionObserved=True,unitExecutionObserved=True,childStatus=status)
  if result['childExecutionObserved'] and isinstance(value.get('invocationId'),str) and re.fullmatch('[a-f0-9]{32}',value['invocationId']):result['invocationId']=value['invocationId']
 if timed_out or result.get('unitResult') in ('timeout','oom-kill','watchdog','resources'):
  result.update(category='timeout-or-resource',code='MIGRATOR_TIMEOUT_OR_RESOURCE')
 if exit_code==0 and not timed_out and result.get('unitResult','success')=='success' and result.get('childStatus') in ('MIGRATOR_PREFLIGHT_PASS','PRISMA_DEPLOY_PASS'):
  result.update(category='success',code='MIGRATOR_COMMAND_PASS')
 return result

def diagnose_migration_command(command,stdout,stderr,exit_code,timed_out=False):
 result=migration_diagnostic(stdout,stderr,exit_code,timed_out)
 if 'execMainStatus' not in result and not result['childExecutionObserved']:
  result=migration_diagnostic(stdout,stderr,exit_code,timed_out,migration_unit_evidence(command))
 return result

def public_migration_diagnostic(value):
 return {k:value[k] for k in ('code','category','exitCode','childCode','execMainCode','execMainStatus','unitResult') if k in value}

def migration_output(command):
 paths=[str(v).split('StandardOutput=append:',1)[1] for v in command if str(v).startswith('StandardOutput=append:')]
 need(len(paths)==1,'MIGRATOR_OUTPUT_CONTRACT')
 path=Path(paths[0])
 if not path.exists():return b''
 st=path.lstat();need(path.is_file() and not path.is_symlink() and st.st_uid==os.geteuid() and st.st_mode&0o777==0o600,'MIGRATOR_OUTPUT_CUSTODY')
 need(st.st_size<=65536,'MIGRATOR_OUTPUT_LIMIT');return path.read_bytes()

def run(a,timeout=45):
 command=[str(x) for x in a];is_migrator=command[0]=='systemd-run' and any(re.fullmatch('--unit=traceflow-live-cd-migrate-(check-)?[0-9]+',x) for x in command)
 try:p=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,env={**os.environ,'HOME':'/nonexistent','LANG':'C.UTF-8','GH_PROMPT_DISABLED':'1'})
 except subprocess.TimeoutExpired as timeout_error:
  if not is_migrator:raise
  error=ValueError('MIGRATOR_TIMEOUT_OR_RESOURCE');error.migration_diagnostics=[diagnose_migration_command(command,migration_output(command),timeout_error.stderr,None,True)];raise error from None
 output=migration_output(command) if is_migrator else p.stdout
 if p.returncode:
  error=ValueError('COMMAND_'+Path(command[0]).name.upper().replace('-','_'))
  if is_migrator:
   diagnostic=diagnose_migration_command(command,output,p.stderr,p.returncode)
   error=ValueError(diagnostic['code']);error.migration_diagnostics=[diagnostic]
  raise error
 if is_migrator:need(bool(output),'MIGRATOR_OUTPUT_MISSING')
 return output

def atomic(p,v,mode=0o600):
 t=p.with_name('.write-'+str(os.getpid()));t.write_bytes(canonical(v));t.chmod(mode);os.replace(t,p)
def fetch(url,dest=None):
 need(url.startswith(('https://api.github.com/','https://github.com/'+REPO+'/releases/')),'HTTPS_SOURCE')
 req=urllib.request.Request(url,headers={'User-Agent':'TraceFlow-clean-CD','Accept':'application/vnd.github+json'})
 with urllib.request.urlopen(req,timeout=45) as response:
  need(response.url.startswith(('https://api.github.com/','https://github.com/','https://release-assets.githubusercontent.com/','https://objects.githubusercontent.com/')),'REDIRECT_SOURCE')
  if dest:
   total=0
   with dest.open('xb') as out:
    for b in iter(lambda:response.read(1024*1024),b''):
     total+=len(b);need(total<=300*1024**2,'DOWNLOAD_CAPACITY');out.write(b)
  else:return json.load(response)

def protected_fingerprints(paths):
 return {str(p):{'sha256':sha(p),'uid':p.stat().st_uid,'gid':p.stat().st_gid,'mode':p.stat().st_mode&0o7777} for p in map(Path,paths)}

def valid_window(request,cfg):
 now=dt.datetime.now(dt.timezone.utc).timestamp()
 issued=dt.datetime.fromisoformat(request['issuedAt']);expires=dt.datetime.fromisoformat(request['expiresAt'])
 need(issued.tzinfo is not None and expires.tzinfo is not None and 0<(expires-issued).total_seconds()<=1200,'DEPLOYMENT_DURATION')
 need(dt.datetime.fromisoformat(cfg['installedAt']).timestamp()<=dt.datetime.fromisoformat(request['issuedAt']).timestamp()<=now<dt.datetime.fromisoformat(request['expiresAt']).timestamp(),'DEPLOYMENT_WINDOW')
 value=fetch('https://api.github.com/repos/'+REPO+'/actions/runs/'+str(request['runId']))
 need(value['status']=='in_progress' and value['event']=='workflow_dispatch' and value['head_sha']==request['workflowSha'] and value['path']==WORKFLOW,'WORKFLOW_NOT_ACTIVE')

def validate_migration_chain(actual,migrations):
 expected=[x['name']+'\t'+x['sha256'] for x in migrations]
 def normalized(rows):
  pairs=[row.split('\t') for row in rows]
  need(all(len(pair)==2 and all(pair) for pair in pairs),'LIVE_MIGRATION_CHAIN')
  need(len({pair[0] for pair in pairs})==len(pairs),'LIVE_MIGRATION_CHAIN')
  return sorted(pairs,key=lambda pair:pair[0])
 need(len(actual)==len(expected) and normalized(actual)==normalized(expected),'LIVE_MIGRATION_CHAIN')

def current_manifest(path):
 schema=path/'backend/prisma/schema.prisma'
 return {'schemaSha256':sha(schema),'migrations':[{'name':p.parent.name,'sha256':sha(p)} for p in sorted((path/'backend/prisma/migrations').glob('*/migration.sql'))]}

def protected_document(path):
 path=Path(path)
 for parent in (path,*path.parents):
  st=parent.lstat();need(st.st_uid==0 and not st.st_mode&0o022 and not parent.is_symlink(),'TRANSITION_CUSTODY')
 need(path.is_file() and path.stat().st_mode&0o077==0,'TRANSITION_CUSTODY')
 return json.loads(path.read_bytes())

def applied_chain(ops):
 rows=ops.sql('SELECT CONCAT(migration_name,CHAR(9),checksum,CHAR(9),finished_at IS NOT NULL,CHAR(9),rolled_back_at IS NOT NULL) FROM _prisma_migrations ORDER BY migration_name')
 pairs=[r.split('\t') for r in rows]
 need(all(len(r)==4 and r[2:] == ['1','0'] for r in pairs),'LIVE_MIGRATION_HISTORY_INCOMPLETE')
 return [r[0]+'\t'+r[1] for r in pairs]

def migration_unit(root,run_id,check=False,output=None):
 need(str(run_id).isdigit(),'MIGRATION_RUN_ID')
 output=Path(output) if output is not None else STATE/('migrator-'+('check-' if check else '')+str(run_id)+'.json')
 need(output.is_absolute() and not any(c in str(output) for c in ('\n','\r','\x00')),'MIGRATOR_OUTPUT_PATH')
 # The manager opens this root-only file; --pipe FD forwarding resets the bus in this sandbox.
 # No After=parent: the receiver is a oneshot still activating while awaiting this child.
 return ['systemd-run','--wait','--collect','--unit=traceflow-live-cd-migrate-'+('check-' if check else '')+str(run_id),'-p','Type=exec','-p','BindsTo=traceflow-live-cd.service','-p','PartOf=traceflow-live-cd.service','-p','User=root','-p','UMask=0077','-p','LoadCredentialEncrypted=mysql-migrator:/etc/credstore.encrypted/traceflow-live-mysql-migrator','-p','RuntimeMaxSec='+('60' if check else '300'),'-p','TimeoutStopSec=15','-p','KillMode=control-group','-p','Restart=no','-p','LimitCORE=0','-p','MemorySwapMax=0','-p','MemoryMax=512M','-p','ProtectSystem=strict','-p','ProtectHome=yes','-p','PrivateTmp=yes','-p','PrivateDevices=yes','-p','NoNewPrivileges=yes','-p','ProtectKernelTunables=yes','-p','ProtectKernelModules=yes','-p','ProtectKernelLogs=yes','-p','ProtectControlGroups=yes','-p','RestrictSUIDSGID=yes','-p','RestrictRealtime=yes','-p','LockPersonality=yes','-p','RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6','-p','InaccessiblePaths=/etc/traceflow /opt/traceflow/shared /var/lib/traceflow-recovery /var/lib/traceflow/test-evidence /etc/traceflow-live /etc/nginx /etc/credstore.encrypted -/var/lib/systemd/credential.secret -/var/lib/traceflow-live-cd/gh-config','-p','StandardOutput=append:'+str(output),'-p','StandardError=null','/usr/bin/python3','-I','-B','/usr/local/libexec/traceflow-live-cd/migrate.py',root]+(['--check'] if check else [])

def data_fingerprint(ops):
 """SELECT-only dump in anonymous RAM; only row hashes/counts leave this function."""
 need(hasattr(os,'memfd_create'),'ANONYMOUS_MEMORY_REQUIRED')
 limit=512*1024**2;fd=os.memfd_create('traceflow-migration-readonly',os.MFD_CLOEXEC)
 with os.fdopen(fd,'w+b') as dump:
  def bound():resource.setrlimit(resource.RLIMIT_FSIZE,(limit,limit))
  p=subprocess.run(ops.mysql_args('mysqldump')+ops.DUMP_FLAGS+[ops.SCHEMA],stdin=subprocess.DEVNULL,stdout=dump,stderr=subprocess.PIPE,timeout=120,preexec_fn=bound,env={'PATH':'/usr/bin:/bin','HOME':'/nonexistent','LANG':'C.UTF-8'})
  need(p.returncode==0 and 0<dump.tell()<=limit,'DATA_FINGERPRINT_CAPTURE_FAILED');dump.flush();dump.seek(0)
  snapshot=ops.dump_manifest(Path('/proc/self/fd/'+str(fd)))
 rows=ops.sql("SELECT CONCAT(migration_name,CHAR(9),SHA2(CAST(JSON_ARRAY(id,checksum,started_at,finished_at,rolled_back_at,applied_steps_count,SHA2(COALESCE(logs,''),256)) AS CHAR),256)) FROM _prisma_migrations ORDER BY migration_name")
 pairs=[r.split('\t') for r in rows];need(all(len(r)==2 for r in pairs),'MIGRATION_AUDIT_FORMAT')
 ledger=dict(pairs);need(len(ledger)==len(pairs),'MIGRATION_AUDIT_DUPLICATE')
 return {'tables':{n:{k:v[k] for k in ('rows','dataSha256')} for n,v in snapshot['tables'].items() if n!='_prisma_migrations'},'ledger':ledger}

class Host:
 def __init__(self,root,manifest,request,work,cfg):
  self.root=root;self.manifest=manifest;self.request=request;self.work=work;self.cfg=cfg
  self.units={n:Path('/etc/systemd/system')/('traceflow-live-'+n+'.service.d/30-cd-release.conf') for n in ('api','worker','retention')}
  self.old={str(p):p.read_bytes() if p.exists() else None for p in self.units.values()}
  self.proxy=Path('/etc/nginx/traceflow-live/proxy.conf');self.nginx=Path('/etc/nginx/conf.d/traceflow.conf')
  self.old_proxy=self.proxy.read_bytes();self.old_nginx=self.nginx.read_bytes();self.frontend=FRONTENDS/root.name
  self.previous=Path(cfg['currentRelease']);self.previous_state={k:cfg[k] for k in CURRENT_KEYS}
  self.candidate=Path('/etc/systemd/system/traceflow-live-cd-candidate.service')
  # Mark attempts before side effects: even a failed command may have taken effect.
  self.routing_changed=False;self.reload_attempted=False;self.changed_units=set();self.restarted_units=set();self.state_attempted=False
  self.recovery={'status':'not-needed'}
  self.schema_guard_claimed=False;self.retention_target_ready=False
  self.migrator_preflight=None;self.plan=None;self.migration_quiesced=False;self.schema_started=False;self.schema_complete=False;self.migration_result={'status':'not-required'}
 def invoke_migrator(self,check=False):
  output=self.work/('migrator-check-output.json' if check else 'migrator-deploy-output.json')
  # Exclusive, protected output prevents replay/overwrite and grants no writable directory to the child.
  with output.open('xb') as out:os.fchmod(out.fileno(),0o600)
  try:
   output=run(migration_unit(self.root,self.request['runId'],check=check,output=output),timeout=75 if check else 330)
  except BaseException as error:
   diagnostics=getattr(error,'migration_diagnostics',[])
   if diagnostics:
    # Filtered metadata only. Never save raw stdout/stderr, SQL, URLs or credentials.
    atomic(self.work/('migrator-check-diagnostic.json' if check else 'migrator-deploy-diagnostic.json'),{'diagnostics':diagnostics})
    if check:self.migrator_preflight={'status':'FAILED','diagnostics':[public_migration_diagnostic(d) for d in diagnostics]}
   raise
  if check:self.migrator_preflight={'status':'PASS'}
  return output
 def unit(self,role):
  if role=='retention':return '[Service]\nWorkingDirectory='+str(self.root/'backend')+'\n'
  return '[Service]\nWorkingDirectory='+str(self.root/'backend')+'\nExecStart=\nExecStart=/usr/bin/node '+str(self.root/'backend/src'/('server.js' if role=='api' else 'github-worker.js'))+'\n'
 def preflight(self):
  valid_window(self.request,self.cfg)
  need(not (STATE/'schema-transition-in-progress').exists(),'SCHEMA_TRANSITION_PENDING_REVIEW')
  need(run(['getenforce']).strip()==b'Enforcing','SELINUX')
  need(protected_fingerprints(self.cfg['protectedFiles'])==self.cfg['protectedFiles'],'OPERATIONAL_CONFIG_CHANGED')
  metrics=json.loads(Path('/var/lib/traceflow-live-ops/metrics.json').read_bytes());need(not metrics['failures'] and time.time()-dt.datetime.fromisoformat(metrics['at']).timestamp()<180,'CURRENT_HEALTH')
  backup=json.loads(Path('/var/lib/traceflow-live-ops/last-backup.json').read_bytes());need(backup['status']=='SUCCESS' and backup['externalReadback'] and time.time()-dt.datetime.fromisoformat(backup['finishedAt']).timestamp()<26*3600,'BACKUP_CURRENT')
  previous=current_manifest(self.previous);target={k:self.manifest[k] for k in ('schemaSha256','migrations')}
  need(current_manifest(self.root)==target,'CANDIDATE_SCHEMA_MANIFEST_MISMATCH')
  spec=importlib.util.spec_from_file_location('live_ops_readonly','/usr/local/libexec/traceflow-live-ops.py');self.ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.ops)
  validate_migration_chain(applied_chain(self.ops),previous['migrations'])
  if previous!=target:
   digest=self.request.get('transitionSha256','');need(re.fullmatch('[a-f0-9]{64}',digest),'SCHEMA_CHANGE_REQUIRES_APPROVED_TRANSITION')
   folder=Path('/etc/traceflow-live/cd-transitions')/digest
   self.plan=protected_document(folder/'plan.json');upgrade=protected_document(folder/'upgrade.json');restore=protected_document(folder/'restore.json');runtime=protected_document(folder/'runtime.json')
   need(sha(folder/'upgrade.json')==self.plan['upgradeEvidenceSha256'] and sha(folder/'restore.json')==self.plan['restoreEvidenceSha256'],'TRANSITION_EVIDENCE_DIGEST')
   need(sha(folder/'runtime.json')==self.plan['runtimeEvidenceSha256'],'TRANSITION_RUNTIME_DIGEST')
   need(runtime.get('status')=='ISOLATED_RUNTIME_COMPATIBILITY_PASS' and runtime.get('previousApiReadyOnTarget') is True and runtime.get('previousClientReadsOnTarget') is True and runtime.get('previousApiExit')==0 and runtime.get('targetSchemaSha256')==target['schemaSha256'] and runtime.get('previousCommit')==json.loads((self.previous/'cd-manifest.json').read_bytes())['commit'],'TRANSITION_PREVIOUS_BINARY_PROOF')
   pending=transition(self.plan,previous,target,self.request['appSha'],digest,backup,restore)
   need(dt.datetime.fromisoformat(self.plan['expiresAt'])>=dt.datetime.fromisoformat(self.request['expiresAt']),'TRANSITION_WINDOW_TOO_SHORT')
   need((dt.datetime.fromisoformat(self.request['expiresAt'])-dt.datetime.fromisoformat(backup['finishedAt'])).total_seconds()<=26*3600,'BACKUP_WINDOW_TOO_SHORT')
   need(upgrade.get('baseline')==runtime['previousCommit'] and upgrade.get('fromSchemaSha256')==previous['schemaSha256'] and upgrade.get('toSchemaSha256')==target['schemaSha256'],'TRANSITION_UPGRADE_BASELINE')
   need(upgrade.get('status')=='ISOLATED_UPGRADE_PASS' and upgrade.get('from')==len(previous['migrations']) and upgrade.get('to')==len(target['migrations']) and upgrade.get('added')==pending and upgrade.get('backfills') is True and upgrade.get('productionUsed') is False,'TRANSITION_UPGRADE_PROOF')
   # Operations must recognize both exact schemas before any DDL, including future backups.
   cfg_ops=json.loads(Path('/etc/traceflow-live/operations.json').read_bytes())
   contracts=cfg_ops.get('schemaContracts',[])
   need(all(any(c.get('migrations')==m['migrations'] and c.get('schemaSha256')==m['schemaSha256'] for c in contracts) for m in (previous,target)),'OPERATIONAL_SCHEMA_COMPATIBILITY')
   self.transition_digest=digest
   migrator=json.loads(self.invoke_migrator(check=True))
   need(migrator.get('status')=='MIGRATOR_PREFLIGHT_PASS','MIGRATOR_PREFLIGHT')
   atomic(self.work/'migrator-preflight.json',migrator)
  else:
   schema_gate(self.manifest,previous)
   need(not self.request.get('transitionSha256'),'UNNECESSARY_TRANSITION')
  need(not self.candidate.exists() and not self.frontend.exists(),'NO_PARTIAL_INSTALL')
  need(sha(self.nginx)==self.cfg['nginxSha256'] and sha(self.proxy)==self.cfg['proxySha256'],'CONFIG_CHANGED_REVIEW_REQUIRED')
  for unit in ['traceflow-live-api','traceflow-live-worker','traceflow-live-backup.timer','traceflow-live-monitor.timer','traceflow-live-retention.timer']:run(['systemctl','is-active',unit])
  # Audit files and previous drop-ins are preserved root-only before coordinated promotion.
  for name,data in [('nginx.conf',self.old_nginx),('proxy.conf',self.old_proxy)]: (self.work/name).write_bytes(data)
  (self.work/'previous-dropins.json').write_bytes(canonical({k:v.decode() if v else None for k,v in self.old.items()}))
  shutil.copytree(self.root/'frontend',self.frontend,symlinks=False)
  old_assets=Path(self.cfg['frontendRoot'])/'assets'
  for source in old_assets.rglob('*'):
   if not source.is_file():continue
   need(not source.is_symlink(),'OLD_ASSET_LINK');target=self.frontend/'assets'/source.relative_to(old_assets)
   if target.exists():need(sha(target)==sha(source),'ASSET_NAME_COLLISION')
   else:
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
    for parent in (target.parent,*target.parent.parents):
     if parent==self.frontend:break
     parent.chmod(0o755)
    shutil.copy2(source,target);target.chmod(0o644)
  run(['restorecon','-R',self.root,self.frontend])
 def release_schema_guard(self):
  if not self.schema_guard_claimed:return
  guard=STATE/'schema-transition-in-progress'
  need(not guard.is_symlink() and json.loads(guard.read_bytes())['runId']==self.request['runId'],'SCHEMA_GUARD_OWNERSHIP')
  guard.unlink();self.schema_guard_claimed=False
  fd=os.open(STATE,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(fd)
  finally:os.close(fd)
 def select_retention_target(self):
  p=self.units['retention'];self.changed_units.add('retention')
  p.parent.mkdir(mode=0o755,parents=True,exist_ok=True);p.write_text(self.unit('retention'));run(['restorecon',p]);run(['systemctl','daemon-reload'])
  self.retention_target_ready=True
 def apply_migrations(self):
  if self.plan is None:return
  valid_window(self.request,self.cfg)
  marker=STATE/('migration-'+self.transition_digest+'.json')
  with marker.open('xb') as out:out.write(canonical({'status':'QUIESCING','runId':self.request['runId'],'transitionSha256':self.transition_digest}))
  guard=STATE/'schema-transition-in-progress'
  with guard.open('xb') as out:
   out.write(canonical({'runId':self.request['runId'],'at':dt.datetime.now(dt.timezone.utc).isoformat()}));out.flush();os.fsync(out.fileno())
  self.schema_guard_claimed=True;self.migration_quiesced=True
  fd=os.open(STATE,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(fd)
  finally:os.close(fd)
  try:
   need(run(['systemctl','show','traceflow-live-retention','--property=ActiveState','--value']).strip()==b'inactive','RETENTION_OPERATION_ACTIVE')
   for role in ('worker','api'):
    self.restarted_units.add(role);run(['systemctl','stop','traceflow-live-'+role],timeout=120)
   validate_migration_chain(applied_chain(self.ops),self.plan['from']['migrations'])
   before=data_fingerprint(self.ops);atomic(self.work/'data-before.json',before)
   self.schema_started=True;atomic(marker,{'status':'DDL_STARTED','runId':self.request['runId'],'transitionSha256':self.transition_digest})
   output=self.invoke_migrator(check=False)
   self.migration_result=json.loads(output);need(self.migration_result.get('status')=='PRISMA_DEPLOY_PASS','PRISMA_DEPLOY_RESULT')
   validate_migration_chain(applied_chain(self.ops),self.plan['to']['migrations'])
   after=data_fingerprint(self.ops);atomic(self.work/'data-after.json',after)
   need(all(after['tables'].get(n)==v for n,v in before['tables'].items()),'PREEXISTING_DATA_CHANGED_BY_MIGRATION')
   need(all(after['ledger'].get(n)==v for n,v in before['ledger'].items()),'HISTORICAL_MIGRATION_RECORD_CHANGED')
   self.schema_complete=True;self.select_retention_target()
   self.migration_result.update(status='SCHEMA_TRANSITION_COMPLETE',transitionSha256=self.transition_digest,added=self.plan['added'],preexistingDataPreserved=True,dataBeforeSha256=sha(self.work/'data-before.json'),dataAfterSha256=sha(self.work/'data-after.json'))
   atomic(marker,self.migration_result);atomic(self.work/'migration.json',self.migration_result)
  except BaseException as error:
   containment='not-started'
   if self.schema_started:
    containment='requires-verification'
    try:
     run(['systemctl','stop','traceflow-live-cd-migrate-'+str(self.request['runId'])],timeout=30);containment='unit-stop-confirmed'
    except BaseException:pass
   self.migration_result={'containment':containment,'databaseStability':'requires-administrative-verification' if self.schema_started else 'ddl-not-started','databaseSchemaComplete':self.schema_complete,'status':'SCHEMA_TRANSITION_INCOMPLETE','transitionSha256':self.transition_digest,'automaticRetry':False,'diagnostics':[public_migration_diagnostic(d) for d in getattr(error,'migration_diagnostics',[])]}
   try:self.migration_result['observedHistory']=self.ops.sql('SELECT CONCAT(migration_name,CHAR(9),checksum,CHAR(9),finished_at IS NOT NULL,CHAR(9),rolled_back_at IS NOT NULL) FROM _prisma_migrations ORDER BY migration_name')
   except BaseException:self.migration_result['historyObservationUnavailable']=True
   atomic(marker,self.migration_result);atomic(self.work/'migration.json',self.migration_result);raise
 def start_candidate(self):
  base=Path('/etc/systemd/system/traceflow-live-api.service').read_text()
  lines=[]
  for line in base.splitlines():
   if line.startswith('WorkingDirectory='):line='WorkingDirectory='+str(self.root/'backend')
   elif line.startswith('ExecStart='):line='ExecStart=/usr/bin/env PORT=3002 /usr/bin/node '+str(self.root/'backend/src/server.js')
   elif line.startswith('Restart='):line='Restart=no'
   lines.append(line)
  self.candidate.write_text('\n'.join(lines)+'\n');run(['restorecon',self.candidate]);run(['systemctl','daemon-reload']);run(['systemctl','start','traceflow-live-cd-candidate'])
 def ready(self,port,timeout=40):
  until=time.monotonic()+timeout
  while time.monotonic()<until:
   try:
    p=run(['curl','--fail','--silent','--show-error','--max-time','3',f'http://127.0.0.1:{port}/health/ready'],timeout=5)
    need(json.loads(p).get('status')=='ready','READINESS');return
   except (ValueError,subprocess.TimeoutExpired):time.sleep(1)
  raise ValueError('READINESS_TIMEOUT')
 def candidate_ready(self):self.ready(3002)
 def route_candidate(self):
  valid_window(self.request,self.cfg)
  need(self.old_proxy.count(b'proxy_pass http://127.0.0.1:3001;')==1,'PROXY_CONTRACT')
  need(self.old_nginx.count(('root '+self.cfg['frontendRoot']+';').encode())==1,'FRONTEND_ROOT_CONTRACT')
  self.routing_changed=True
  self.proxy.write_bytes(self.old_proxy.replace(b'proxy_pass http://127.0.0.1:3001;',b'proxy_pass http://127.0.0.1:3002;',1))
  self.nginx.write_bytes(self.old_nginx.replace(('root '+self.cfg['frontendRoot']+';').encode(),('root '+str(self.frontend)+';').encode()))
  run(['nginx','-t']);self.reload_attempted=True;run(['systemctl','reload','nginx'])
 def promote_services(self):
  for role,p in self.units.items():
   self.changed_units.add(role);p.parent.mkdir(mode=0o755,exist_ok=True);p.write_text(self.unit(role));run(['restorecon',p])
  run(['systemctl','daemon-reload'])
  for role,timeout in (('api',90),('worker',120)):
   self.restarted_units.add(role);run(['systemctl','restart','traceflow-live-'+role],timeout=timeout)
 def official_ready(self):
  self.ready(3001)
  for unit in ('traceflow-live-api','traceflow-live-worker'):run(['systemctl','is-active',unit])
  # Use the existing read-only monitor/credential, never an administrative DB client.
  run(['systemctl','start','traceflow-live-monitor.service'],timeout=100)
  v=json.loads(Path('/var/lib/traceflow-live-ops/metrics.json').read_bytes());need(v['mysql'] and v['workerCount']==1 and v['workerHeartbeatAgeSeconds']<=90,'WORKER_OR_MYSQL')
  if (self.root/'backend/src/jobs/job-runner.js').exists():
   until=time.monotonic()+30
   expected={'notifications-due','github-event-dispatch','traceability-notice-dispatch','traceability-alerts'}
   while time.monotonic()<until:
    names=set(self.ops.sql('SELECT name FROM ScheduledJobLease'))
    if names==expected:break
    time.sleep(1)
   need(names==expected,'SCHEDULED_JOBS_NOT_STARTED')
   run(['systemctl','start','traceflow-live-monitor.service'],timeout=100)
   jobs=json.loads(Path('/var/lib/traceflow-live-ops/metrics.json').read_bytes()).get('scheduledJobs',{})
   need(jobs.get('enabled') is True and jobs.get('failedEvents15m')==0 and set(jobs.get('leaseAgeSeconds',{}))==expected,'SCHEDULED_JOBS_HEALTH')
 def route_official(self):self.proxy.write_bytes(self.old_proxy);run(['nginx','-t']);run(['systemctl','reload','nginx'])
 def smoke(self):
  valid_window(self.request,self.cfg)
  need(protected_fingerprints(self.cfg['protectedFiles'])==self.cfg['protectedFiles'],'OPERATIONAL_PRESERVATION')
  content=run(['curl','--fail','--silent','--show-error','--max-time','15','https://traceflow.dev/'],timeout=20)
  need(b'<html' in content and sha(self.frontend/'index.html')==hashlib.sha256(content).hexdigest(),'PUBLIC_FRONTEND')
  run(['systemctl','is-active','traceflow-live-backup.timer','traceflow-live-monitor.timer','traceflow-live-retention.timer'])
 def commit(self):
  value={'currentRelease':str(self.root),'frontendRoot':str(self.frontend),'nginxSha256':sha(self.nginx),'proxySha256':sha(self.proxy)}
  self.state_attempted=True;atomic(STATE/'current.json',value);self.cfg.update(value);self.release_schema_guard()
 def restore_previous(self):
  need(not self.schema_started or self.schema_complete,'MIGRATION_INCOMPLETE_OPERATOR_REQUIRED')
  self.recovery={'status':'started','routingChanged':self.routing_changed,'reloadAttempted':self.reload_attempted,'restartedUnits':sorted(self.restarted_units),'changedDropins':sorted(self.changed_units),'stateAttempted':self.state_attempted}
  if self.state_attempted:atomic(STATE/'current.json',self.previous_state);self.cfg.update(self.previous_state)
  if self.routing_changed:self.proxy.write_bytes(self.old_proxy);self.nginx.write_bytes(self.old_nginx)
  for role in sorted(self.changed_units):
   if role=='retention' and self.schema_complete:continue
   p=self.units[role];data=self.old[str(p)]
   if data is None:p.unlink(missing_ok=True)
   else:p.write_bytes(data)
  if self.changed_units:run(['systemctl','daemon-reload'])
  for role,timeout in (('api',90),('worker',120)):
   if role in self.restarted_units:run(['systemctl','restart','traceflow-live-'+role],timeout=timeout)
  if self.routing_changed:run(['nginx','-t'])
  if self.reload_attempted:run(['systemctl','reload','nginx'])
  return self.reload_attempted or bool(self.restarted_units)
 def recovery_complete(self):
  need(not self.schema_started or (self.schema_complete and self.retention_target_ready),'SCHEMA_TRANSITION_REQUIRES_INTERVENTION')
  self.release_schema_guard();self.recovery['status']='complete'
 def recovery_failed(self,original,recovery):
  def code(error):return str(error) if re.fullmatch('[A-Z][A-Z0-9_]{0,90}',str(error)) else 'UNCLASSIFIED_FAILURE'
  self.recovery.update(status='incomplete',originalFailure=code(original),recoveryFailure=code(recovery))
 def previous_ready(self):self.ready(3001);run(['systemctl','is-active','traceflow-live-worker'])
 def stop_candidate(self):
  if not self.candidate.exists():return
  run(['systemctl','stop','traceflow-live-cd-candidate'],timeout=90)
  # Only this newly-created transient candidate unit is removed; immutable releases/evidence stay.
  if self.candidate.exists():self.candidate.unlink();run(['systemctl','daemon-reload'])

def process(release,cfg):
 tag=release['tag_name'];need(re.fullmatch('oci-cd-[0-9]+-[0-9]+',tag),'RELEASE_TAG')
 marker=STATE/(tag+'.json')
 if marker.exists():return
 assets={x['name']:x for x in release['assets']};need(set(assets)=={'release.tar.gz','request.json','request.sigstore.json'},'ASSETS')
 work=STATE/tag;work.mkdir(mode=0o700)
 for name in ('request.json','request.sigstore.json'):fetch(assets[name]['browser_download_url'],work/name)
 req=json.loads((work/'request.json').read_bytes());need(req['formatVersion']==1 and req['operation']=='promote-clean' and req['repository']==REPO and re.fullmatch('[a-f0-9]{40}',req['appSha']),'REQUEST')
 need(tag==f"oci-cd-{req['runId']}-{req['runAttempt']}" and dt.datetime.now(dt.timezone.utc).timestamp()<dt.datetime.fromisoformat(req['expiresAt']).timestamp(),'REQUEST_EXPIRED_OR_IDENTITY')
 need(re.fullmatch('[a-f0-9]{40}',req.get('workflowSha','')),'WORKFLOW_SHA')
 if req['workflowSha'] not in cfg['trustedWorkflowShas']:
  # Main may advance functionally. Trust only the unchanged complete CD authority
  # set, and bind its immutable commit through the certificate below.
  for name,digest in cfg['authorityFiles'].items():
   value=fetch('https://api.github.com/repos/'+REPO+'/contents/'+name+'?ref='+req['workflowSha'])
   need(value['type']=='file' and hashlib.sha256(base64.b64decode(value['content'])).hexdigest()==digest,'CD_AUTHORITY_CHANGED_REVIEW_REQUIRED')
 run([cfg['gh'],'attestation','verify',work/'request.json','--bundle',work/'request.sigstore.json','--repo',REPO,'--signer-workflow',REPO+'/'+WORKFLOW,'--source-ref','refs/heads/main','--source-digest',req['workflowSha'],'--deny-self-hosted-runners','--cert-oidc-issuer','https://token.actions.githubusercontent.com'],timeout=90)
 # Consumed exactly once, before any installation. Refusals/failures are terminal, never retried.
 atomic(marker,{'status':'STARTED','tag':tag,'appSha':req['appSha'],'at':dt.datetime.now(dt.timezone.utc).isoformat()})
 host=None
 result={'runId':req['runId'],'appSha':req['appSha'],'packageSha256':req['packageSha256'],'status':'FAILED','rollback':'not-needed','workflowSha':req['workflowSha'],'manifestSha256':req['manifestSha256']}
 try:
  fetch(assets['release.tar.gz']['browser_download_url'],work/'release.tar.gz')
  root=RELEASES/(req['appSha']+'-'+req['packageSha256'][:12]);manifest=unpack(work/'release.tar.gz',root,req['packageSha256'])
  need(manifest['commit']==req['appSha'] and sha(root/'cd-manifest.json')==req['manifestSha256'] and manifest['arch']=='aarch64','PACKAGE_IDENTITY')
  host=Host(root,manifest,req,work,cfg);promote(host)
  result.update(status='SUCCESS',release=str(root),rollback='not-required',operationalConfigurationPreserved=True)
 except BaseException as error:
  result.update(code=str(error) if re.fullmatch('[A-Z][A-Z0-9_]{0,90}',str(error)) else 'DEPLOY_FAILED',rollback='inspect-preserved-transaction')
 finally:
  if host is not None:
   result['recovery']=host.recovery;result['migration']=host.migration_result
   if host.migrator_preflight is not None:result['migratorPreflight']=host.migrator_preflight
  result['finishedAt']=dt.datetime.now(dt.timezone.utc).isoformat();atomic(marker,result);atomic(STATUS/(str(req['runId'])+'.json'),result,0o644)
 print(json.dumps(result));need(result['status']=='SUCCESS','PROMOTION_FAILED_NO_RETRY')

def main():
 need(os.geteuid()==0,'ROOT_REQUIRED');os.umask(0o077)
 cfg=json.loads(CONFIG.read_bytes());need(CONFIG.stat().st_uid==0 and CONFIG.stat().st_mode&0o077==0,'CONFIG_CUSTODY')
 if (STATE/'current.json').exists():
  current=json.loads((STATE/'current.json').read_bytes());need(set(current)==CURRENT_KEYS,'CURRENT_STATE_FIELDS');cfg.update(current)
 with (STATE/'deploy.lock').open('a+') as lock,Path('/var/lib/traceflow-live-ops/backup.lock').open('a+') as backup_lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  fcntl.flock(backup_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  releases=fetch('https://api.github.com/repos/'+REPO+'/releases?per_page=10')
  for release in reversed(releases):
   if release['draft'] or not re.fullmatch('oci-cd-[0-9]+-[0-9]+',release['tag_name']):continue
   if release['author']['login']!='github-actions[bot]':continue
   age=time.time()-dt.datetime.fromisoformat(release['published_at'].replace('Z','+00:00')).timestamp()
   if age<1800:process(release,cfg)
if __name__=='__main__':
 def interrupted(*_):raise InterruptedError('DEPLOY_INTERRUPTED')
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
 try:main()
 except BaseException as e:
  print(json.dumps({'status':'BLOCKED','code':str(e) if re.fullmatch('[A-Z][A-Z0-9_]{0,90}',str(e)) else 'RECEIVER_FAILED','automaticRetry':False}));sys.exit(1)
