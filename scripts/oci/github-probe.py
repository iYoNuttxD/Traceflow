"""Bounded delivery collector. Runtime modes require a fresh authorized activation."""
import ast,base64,hashlib,importlib.util,json,os,re,sys,uuid
from pathlib import Path
MODULES=Path(__file__).resolve().parent;ROOT=MODULES.parents[1];B=None
SOURCE=r'''import base64,json,os,sys,subprocess,hashlib,resource,datetime,stat,time,signal,re
from pathlib import Path
resource.setrlimit(resource.RLIMIT_CORE,(0,0));os.umask(0o077)
created=[];p=None;child=None
class Refused(Exception):pass
def need(ok,code):
 if not ok:raise Refused(code)
def pairs(items):
 result={}
 for k,v in items:
  need(k not in result,'PROBE_DUPLICATE_JSON');result[k]=v
 return result
def read_json(path,limit=2097152):
 st=path.lstat();need(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_uid==0 and st.st_size<=limit,'PROBE_CUSTODY')
 return json.loads(path.read_bytes(),object_pairs_hook=pairs)
def interrupted(*_):raise Refused('PROBE_INTERRUPTED')
for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP):signal.signal(sig,interrupted)
def stop_child():
 if child is None or child.poll() is not None:return
 try:os.killpg(child.pid,signal.SIGTERM)
 except ProcessLookupError:pass
 try:child.wait(timeout=3)
 except subprocess.TimeoutExpired:
  try:os.killpg(child.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  child.wait(timeout=3)
def main():
 global p,child
 base=Path('/opt/traceflow/shared/release-state');folder=base/'activations'/CFG['runId']
 s=read_json(base/'state.json');a=read_json(folder/'authorization.json')
 need(s.get('runId')==CFG['runId'] and s['status']=='in-progress' and s['phase']=='postchecks-pending','WINDOW_REQUIRED')
 need(not (folder/'failure.json').exists() and (folder/'pending.json').exists(),'WINDOW_FAILED')
 need((datetime.datetime.fromisoformat(a['expiresAt'].replace('Z','+00:00'))-datetime.datetime.now(datetime.timezone.utc)).total_seconds()>90,'WINDOW_TOO_SHORT')
 for key in ('runId','releaseId','nonce'):need(a[key]==CFG[key],'ATTEMPT_CHANGED')
 if ARGS[0]=='verify':need(datetime.datetime.fromisoformat(ARGS[2].replace('Z','+00:00'))>=datetime.datetime.fromisoformat(read_json(folder/'cutover.json')['at'].replace('Z','+00:00')),'DELIVERY_TIME')
 p=Path('/run')/('traceflow-github-probe-'+PROBE);p.mkdir(mode=0o700)
 identity=(p.stat().st_dev,p.stat().st_ino)
 try:
  for name,encoded in FILES.items():
   need(name in ('github-delivery.mjs','hmac-proof.mjs','github-json.mjs'),'PROBE_MODULE_NAME')
   data=base64.b64decode(encoded,validate=True);need(len(data)<=65536,'PROBE_MODULE_LIMIT');f=p/name
   fd=os.open(f,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   created.append((f,hashlib.sha256(data).hexdigest()))
   with os.fdopen(fd,'wb') as h:h.write(data);h.flush();os.fsync(h.fileno())
  env={'PATH':'/usr/bin:/bin','HOME':'/nonexistent','LANG':'C.UTF-8'}
  for name in ('runtime.env','api.env'):
   source=Path('/etc/traceflow')/name;t=source.lstat();need(stat.S_ISREG(t.st_mode) and t.st_nlink==1 and t.st_uid==0 and t.st_mode&0o777==0o600 and t.st_size<=65536,'PROBE_CREDENTIAL_CUSTODY')
   for line in source.read_text().splitlines():
    if line.startswith('GITHUB_APP_'):
     k,v=line.split('=',1)
     if k in ('GITHUB_APP_ID','GITHUB_APP_SLUG','GITHUB_APP_PRIVATE_KEY_BASE64','GITHUB_APP_WEBHOOK_SECRET'):
      value=json.loads(v);need(isinstance(value,str) and bool(value),'PROBE_CONFIG_VALUE');env[k]=value
  child=subprocess.Popen(['/usr/bin/node',str(p/'github-delivery.mjs'),*ARGS],env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
  try:out,err=child.communicate(timeout=65)
  except subprocess.TimeoutExpired:stop_child();raise Refused('PROBE_TIMEOUT')
  finally:stop_child()
  need(len(out)<65536 and len(err)==0,'PROBE_OUTPUT')
  result=json.loads(out,object_pairs_hook=pairs);need(isinstance(result,dict) and result.get('status') in ('GITHUB_DELIVERIES_READ','GITHUB_INSTALLATION_CYCLE_COMPLETE','GITHUB_REAL_DELIVERY_VERIFIED','FAIL'),'PROBE_RESULT')
  if child.returncode!=0:
   need(result.get('status')=='FAIL','PROBE_EXIT_MISMATCH')
   code=result.get('code');need(isinstance(code,str) and re.fullmatch(r'[A-Z][A-Z0-9_]{2,80}',code),'PROBE_FAILURE_CODE')
   raise Refused(code)
  need(result['status']!='FAIL','PROBE_EXIT_MISMATCH')
  expected={'list':('GITHUB_DELIVERIES_READ',{'status','productionUrl','installations','deliveries'}),'cycle':('GITHUB_INSTALLATION_CYCLE_COMPLETE',{'status','installationId','account','suspended','reactivated','otherInstallationsModified','at'}),'verify':('GITHUB_REAL_DELIVERY_VERIFIED',{'status','deliveryId','payloadSha256','signatureAccepted','httpStatus','at','event','webhookUrl'})}[ARGS[0]]
  need(result['status']==expected[0] and set(result)==expected[1],'PROBE_RESULT_SHAPE')
  result.update(runId=CFG['runId'],nonce=a['nonce'],authorizationSha256=hashlib.sha256((folder/'authorization.json').read_bytes()).hexdigest(),cutover=read_json(folder/'cutover.json')['at'])
  return result
 finally:
  stop_child()
  need(not p.is_symlink() and (p.stat().st_dev,p.stat().st_ino)==identity,'CLEANUP_DIRECTORY_IDENTITY')
  for f,h in created:
   need(f.parent==p and not f.is_symlink() and f.stat().st_uid==0 and hashlib.sha256(f.read_bytes()).hexdigest()==h,'CLEANUP_IDENTITY')
   f.unlink()
  need(not list(p.iterdir()),'CLEANUP_UNEXPECTED_FILE');p.rmdir()
try:
 result=main()
except BaseException as e:
 code=str(e) if isinstance(e,Refused) else 'PROBE_FAILED'
 if not re.fullmatch(r'[A-Z][A-Z0-9_]{2,80}',code):code='PROBE_FAILED'
 print(json.dumps({'status':'FAIL','code':code,'secretsPrinted':False}));sys.exit(1)
else:print(json.dumps(result));sys.exit(0)
'''
def build(args,cfg,probe):
 if not (args in (['list'],['cycle']) or len(args)==3 and args[0]=='verify' and re.fullmatch(r'[1-9]\d{0,39}',args[1])):raise ValueError('PROBE_ARGUMENTS')
 if not re.fullmatch('[a-f0-9]{32}',probe) or not isinstance(cfg,dict):raise ValueError('PROBE_CONFIG')
 if not all(isinstance(cfg.get(k),str) and re.fullmatch('[a-f0-9]{32}',cfg[k]) for k in ('runId','nonce')) or not isinstance(cfg.get('releaseId'),str) or not re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{40}-[a-f0-9]{12}',cfg['releaseId']):raise ValueError('PROBE_CONFIG')
 files={n:base64.b64encode(((ROOT/'backend/src/modules/github/github-json.js') if n=='github-json.mjs' else MODULES/n).read_bytes()).decode() for n in ('github-delivery.mjs','hmac-proof.mjs','github-json.mjs')}
 code='CFG='+repr(cfg)+'\nARGS='+repr(args)+'\nPROBE='+repr(probe)+'\nFILES='+repr(files)+'\n'+SOURCE;ast.parse(code);return code

def main():
 global B
 if sys.argv[1:]==['--check']:
  ast.parse(SOURCE);print('PROBE_SOURCE_PARSED_NOT_RUNTIME_APPROVED');return
 if len(sys.argv)<4 or sys.argv[1]!='--evidence-dir':raise ValueError('EVIDENCE_DIRECTORY_REQUIRED')
 B=Path(sys.argv[2]).resolve();B.relative_to(ROOT/'build')
 if not B.is_dir() or B.stat().st_uid!=os.geteuid() or B.stat().st_mode&0o077:raise ValueError('EVIDENCE_DIRECTORY_CUSTODY')
 cfg=json.loads((B/'context.json').read_bytes());args=sys.argv[3:];probe=uuid.uuid4().hex;code=build(args,cfg,probe)
 if args==['cycle']:
  fd=os.open(B/'github-cycle-invoked.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'w') as f:json.dump({'probeId':probe,'runId':cfg['runId'],'installationId':150643350,'automaticRetry':False},f);f.flush();os.fsync(f.fileno())
 s=importlib.util.spec_from_file_location('github_probe_session',ROOT/'build/oci-07-16b-reconciliation/session.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);m.m.OUT=B
 print(json.dumps(m.remote('github-'+args[0]+'-'+probe,code,timeout=85)))
if __name__=='__main__':
 try:main()
 except BaseException:
  print(json.dumps({'status':'FAIL','code':'PROBE_STOP_REVIEW_REQUIRED','secretsPrinted':False}));sys.exit(1)
