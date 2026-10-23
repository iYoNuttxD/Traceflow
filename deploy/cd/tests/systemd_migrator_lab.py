#!/usr/bin/env python3
"""Explicit root-only OCI lab: synthetic credentials/child, no SQL or production changes."""
import datetime as dt,hashlib,inspect,json,os,re,subprocess,sys,uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import receiver

def call(args,**kwargs):return subprocess.run(list(map(str,args)),capture_output=True,timeout=kwargs.pop('timeout',40),**kwargs)
def require(value,code):
 if not value:raise ValueError(code)
def write(path,value):
 with path.open('x') as out:out.write(value)
 path.chmod(0o600)
def filtered(text):
 # This lab never invokes MySQL or loads real credentials. Still filter all messages.
 text=text.decode(errors='replace')[:8192]
 text=re.sub(r'(?:https?|mysql)://\S+','[REDACTED_URL]',text)
 text=re.sub(r'(?i)(password|token|cookie|secret)\s*[=:]\s*\S+',r'\1=[REDACTED_SECRET]',text)
 return text.replace('TRACEFLOW_SYNTHETIC_CREDENTIAL_V1','[SYNTHETIC_VALUE]')

CHILD=r'''
import hashlib,json,os,sys,time
from pathlib import Path
mode=sys.argv[1]
if mode=='no-credential':print(json.dumps({'status':'MIGRATOR_PREFLIGHT_PASS','synthetic':True,'databaseAccess':False}));sys.exit()
credential=Path(os.environ['CREDENTIALS_DIRECTORY'])/'mysql-migrator'
assert hashlib.sha256(credential.read_bytes()).hexdigest()==sys.argv[2]
proof={'invocationId':os.environ.get('INVOCATION_ID'),'synthetic':True,'databaseAccess':False}
if mode=='blocked':print(json.dumps({**proof,'status':'BLOCKED','code':'MIGRATOR_TLS_CONNECTION'}),flush=True);sys.exit(1)
if mode=='timeout':time.sleep(8)
if mode=='memory':data=bytearray(128*1024*1024)
print(json.dumps({**proof,'status':'MIGRATOR_PREFLIGHT_PASS'}),flush=True)
'''
PARENT=r'''
import importlib.util,json,os,subprocess,sys,time
from pathlib import Path
sys.path.insert(0,sys.argv[1]);import receiver
folder=Path(sys.argv[2]);spec=json.loads((folder/'spec.json').read_bytes());results=[]
state=subprocess.check_output(['systemctl','show',spec['parent'],'-p','ActiveState','--value']).decode().strip()
assert state=='activating'
baseline_spec=importlib.util.spec_from_file_location('baseline_receiver',folder/'baseline_receiver.py');baseline=importlib.util.module_from_spec(baseline_spec);baseline_spec.loader.exec_module(baseline)
for index,case in enumerate(spec['cases']):
 legacy=case in ('baseline','no-pipe','no-binds','no-partof','no-deps','no-credential')
 builder=baseline.migration_unit if legacy else receiver.migration_unit
 output=folder/(case+'-output.json')
 if not legacy:
  with output.open('xb') as out:os.fchmod(out.fileno(),0o600)
 command=builder(Path('/opt/traceflow-live/releases/synthetic-unused'),spec['nonce']+str(index),check=True,**({} if legacy else {'output':output}))
 command=[s.replace('BindsTo=traceflow-live-cd.service','BindsTo='+spec['parent']).replace('PartOf=traceflow-live-cd.service','PartOf='+spec['parent']).replace('LoadCredentialEncrypted=mysql-migrator:/etc/credstore.encrypted/traceflow-live-mysql-migrator','LoadCredentialEncrypted=mysql-migrator:'+spec['credential']) for s in map(str,command)]
 command=command[:command.index('/usr/bin/python3')]+['/usr/bin/python3','-I','-B',str(folder/'child.py'),case,spec['credentialDigest']]
 if case in ('no-binds','no-partof','no-deps','no-credential'):
  remove=[]
  if case in ('no-binds','no-deps'):remove.append('BindsTo=')
  if case in ('no-partof','no-deps'):remove.append('PartOf=')
  if case=='no-credential':remove.append('LoadCredentialEncrypted=')
  for i in reversed(range(len(command))):
   if any(command[i].startswith(prefix) for prefix in remove):del command[i-1:i+1]
 if case=='no-pipe':command.remove('--pipe')
 if case=='exec':command[-6:]=['/nonexistent/traceflow-synthetic-child']
 if case=='namespace':
  i=next(i for i,v in enumerate(command) if v.startswith('InaccessiblePaths='));command[i]+=' '+str(folder/'required-absent')
 if case=='credential':
  i=next(i for i,v in enumerate(command) if v.startswith('LoadCredentialEncrypted='));command[i]='LoadCredentialEncrypted=mysql-migrator:'+spec['wrongCredential']
 if case=='timeout':command=[s.replace('RuntimeMaxSec=60','RuntimeMaxSec=1') for s in command]
 if case=='memory':command=[s.replace('MemoryMax=512M','MemoryMax=16M') for s in command]
 start=time.monotonic()
 try:
  p=subprocess.run(command,capture_output=True,timeout=20)
  diagnostic=receiver.diagnose_migration_command(command,p.stdout if legacy else receiver.migration_output(command),p.stderr,p.returncode)
  stderr=p.stderr
 except subprocess.TimeoutExpired as error:
  diagnostic=receiver.diagnose_migration_command(command,error.stdout if legacy else receiver.migration_output(command),error.stderr,None,True);stderr=error.stderr or b''
 unit=next(s.split('=',1)[1] for s in command if s.startswith('--unit='))
 state=subprocess.run(['systemctl','show',unit,'-p','LoadState','-p','ActiveState','-p','Result','-p','ExecMainCode','-p','ExecMainStatus'],capture_output=True,timeout=10)
 record={'case':case,'parentWasActivating':True,'seconds':round(time.monotonic()-start,3),'command':command,'diagnostic':diagnostic,'stateAfterCollect':state.stdout.decode().splitlines(),'stderrFiltered':filtered(stderr)}
 receiver.atomic(folder/(case+'.json'),record)
 # Stop only this known synthetic unit if a timeout left it around.
 subprocess.run(['systemctl','stop',unit],capture_output=True,timeout=10)
 results.append({k:record[k] for k in ('case','seconds','diagnostic','parentWasActivating')})
receiver.atomic(folder/'results.json',{'status':'SYNTHETIC_SYSTEMD_OBSERVED','results':results,'databaseAccess':False})
print(json.dumps({'status':'SYNTHETIC_SYSTEMD_OBSERVED','results':[{**r,'diagnostic':receiver.public_migration_diagnostic(r['diagnostic'])} for r in results],'databaseAccess':False}))
'''

def main():
 require((sys.argv[1:] in (['--run-synthetic'],['--run-synthetic','--transport-controls']) or (len(sys.argv)==4 and sys.argv[1:3]==['--run-synthetic','--baseline-file'])) and os.geteuid()==0,'EXPLICIT_ROOT_SYNTHETIC_ONLY')
 require(call(['getenforce']).stdout.strip()==b'Enforcing','SELINUX_ENFORCING_REQUIRED');os.umask(0o077)
 source=Path(__file__).resolve().parents[1]
 baseline=Path(sys.argv[3]) if len(sys.argv)==4 else Path('/usr/local/libexec/traceflow-live-cd/receiver.py')
 require(receiver.sha(baseline)=='e327a455bcee9c1c160b7057b461c8ad214c4ea50d2f6e8cc69e4117bbfc9f1e','ORIGINAL_BASELINE_HASH_REQUIRED')
 require(baseline.stat().st_uid==0 and not baseline.stat().st_mode&0o022 and not baseline.is_symlink(),'BASELINE_CUSTODY')
 unit=Path('/etc/systemd/system/traceflow-live-cd.service')
 require(unit.read_bytes()==(source/'traceflow-live-cd.service').read_bytes(),'PARENT_UNIT_DIFFERS_REVIEW_REQUIRED')
 before={str(p):receiver.sha(p) for p in [receiver.STATE/'current.json',Path('/etc/nginx/conf.d/traceflow.conf'),Path('/etc/nginx/traceflow-live/proxy.conf')]}
 pids={n:call(['systemctl','show',n,'-p','MainPID','--value']).stdout for n in ('traceflow-live-api','traceflow-live-worker')}
 require(not (receiver.STATE/'schema-transition-in-progress').exists(),'SCHEMA_OPERATION_PRESENT')
 folder=receiver.STATE/'diagnostics'/('migrator-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]);folder.mkdir(parents=True,mode=0o700)
 require(all(p.stat().st_uid==0 and not p.stat().st_mode&0o022 for p in (folder,folder.parent,receiver.STATE)),'LAB_CUSTODY')
 plaintext=b'TRACEFLOW_SYNTHETIC_CREDENTIAL_V1';credentials={}
 for name in ('mysql-backup','mysql-migrator','wrong-name'):
  target=folder/(name+'.cred');p=call(['systemd-creds','encrypt','--with-key=host','--name='+name,'-',target],input=plaintext);require(p.returncode==0,'SYNTHETIC_ENCRYPT_FAILED');target.chmod(0o600);credentials[name]=str(target)
 write(folder/'child.py',CHILD)
 write(folder/'baseline_receiver.py',baseline.read_text())
 parent='traceflow-cd-synthetic-parent-'+uuid.uuid4().hex[:12]+'.service'
 spec={'parent':parent,'cases':(['baseline','no-pipe','no-binds','no-partof','no-deps','no-credential'] if '--transport-controls' in sys.argv else ['baseline','success','blocked','exec','namespace','credential','timeout','memory']),'nonce':str(int(dt.datetime.now().timestamp()*1000000)),'credential':credentials['mysql-migrator'],'wrongCredential':credentials['wrong-name'],'credentialDigest':hashlib.sha256(plaintext).hexdigest()}
 write(folder/'spec.json',json.dumps(spec))
 write(folder/'parent.py','import re\n'+inspect.getsource(filtered)+'\n'+PARENT)
 args=['systemd-run','--wait','--pipe','--collect','--unit='+parent]
 for line in unit.read_text().splitlines():
  if not line or line.startswith(('#','[')) or '=' not in line:continue
  key,value=line.split('=',1)
  if key in ('Description','After','Wants','Environment','ExecStart','StandardError'):continue
  if key=='LoadCredentialEncrypted':value='mysql-backup:'+credentials['mysql-backup']
  args+=['-p',key+'='+value]
 args+=['/usr/bin/python3','-I','-B',str(folder/'parent.py'),str(source),str(folder)]
 try:
  result=call(args,timeout=240,stdin=subprocess.DEVNULL)
  receiver.atomic(folder/'parent-result.json',{'exitCode':result.returncode,'stderrFiltered':filtered(result.stderr),'stdoutSha256':hashlib.sha256(result.stdout).hexdigest()})
  require(all(receiver.sha(p)==digest for p,digest in before.items()),'PRODUCTION_FILES_CHANGED')
  require(all(call(['systemctl','show',n,'-p','MainPID','--value']).stdout==v for n,v in pids.items()),'PRODUCTION_PID_CHANGED')
  record=json.loads((folder/'results.json').read_bytes()) if (folder/'results.json').exists() else {'status':'SYNTHETIC_PARENT_FAILED','results':[]}
  record.update(folder=str(folder),productionPreserved=True,databaseAccess=False,systemd=call(['systemctl','--version']).stdout.decode().splitlines()[0],selinux='Enforcing')
  receiver.atomic(folder/'summary.json',record)
  print(json.dumps({**record,'results':[{**r,'diagnostic':receiver.public_migration_diagnostic(r['diagnostic'])} for r in record['results']]}))
 finally:
  call(['systemctl','stop',parent])
  for target in credentials.values():Path(target).unlink(missing_ok=True)

if __name__=='__main__':
 try:main()
 except BaseException as e:
  print(json.dumps({'status':'BLOCKED','code':str(e) if re.fullmatch('[A-Z_]{1,90}',str(e)) else 'SYNTHETIC_LAB_FAILED','databaseAccess':False}));sys.exit(1)
