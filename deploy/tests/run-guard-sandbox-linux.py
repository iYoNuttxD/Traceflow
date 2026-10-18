#!/usr/bin/env python3
"""Actual mount namespace: only dedicated guard/state writable; local Lima only."""
import errno,importlib.util,json,os,platform,shutil,socket,subprocess,sys,time,uuid
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'deploy/lib'))
from release_contract import require,atomic_json,encoded,file_digest,fsync_dir
from operational_io import private_write
spec=importlib.util.spec_from_file_location('guard_sandbox_release',ROOT/'deploy/scripts/release.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
def cmd(args,check=True):
 p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=25);require(not check or p.returncode==0,'GUARD_LAB_COMMAND');return p.stdout.strip()
def probe():
 layout=ops.Layout();state=layout.load();state['phase']='probe';layout.save(state)
 require(json.loads(layout.guard.read_bytes())['phase']=='probe','GUARD_ATOMIC_WRITE')
 results=[]
 for target in (layout.app/'current',layout.app/'release-guard.json',layout.releases/'protected',layout.admin/'protected',layout.app/'other'):
  try:
   with target.open('wb') as f:f.write(b'unexpected')
  except OSError as e:require(e.errno==errno.EROFS,'GUARD_LAB_WRONG_DENIAL');results.append(str(target))
  else:require(False,'GUARD_LAB_WRITABLE_PROTECTED')
 atomic_json(layout.state/'probe.json',{'status':'PASS','protectedReadOnly':results,'atomicGuard':True})
def main():
 require(os.geteuid()==0 and socket.gethostname()=='lima-tf072c' and platform.machine()=='aarch64','LOCAL_LIMA_ONLY')
 app=Path('/opt/traceflow');require(not app.exists(),'LAB_PATH_EXISTS');app.mkdir(mode=0o755);inode=app.stat().st_ino
 units=[];unit_file=None;unit_hash=None
 try:
  layout=ops.Layout()
  for d,mode in ((layout.releases,0o755),(layout.admin,0o700),(app/'shared',0o755),(layout.state,0o700)):d.mkdir(mode=mode)
  for p in (layout.releases/'protected',layout.admin/'protected'):private_write(p,b'preserved')
  state={'formatVersion':1,'status':'idle','current':None,'previous':None,'web':None,'history':[],'phase':'migration-complete'}
  atomic_json(layout.state/'state.json',state);guard={k:state.get(k) for k in ('status','phase','current','target','bootId','pid','processStart','expiresAt','runId','operation')}
  legacy=app/'release-guard.json';atomic_json(legacy,guard,0o644);legacy_hash=file_digest(legacy);layout.prepare_guard()
  unit='tf-guard-sandbox-'+uuid.uuid4().hex+'.service';units.append(unit)
  unit_file=Path('/run/systemd/system')/unit
  content=('[Service]\nType=oneshot\nUser=root\nProtectSystem=strict\nReadWritePaths=/opt/traceflow/shared/release-state /opt/traceflow/shared/release-guard\nLimitCORE=0\nExecStart=/usr/bin/python3 -I -B '+str(Path(__file__).resolve())+' probe\n').encode()
  private_write(unit_file,content);unit_hash=file_digest(unit_file);cmd(['systemctl','daemon-reload']);cmd(['systemctl','start',unit])
  proof=json.loads((layout.state/'probe.json').read_bytes());require(file_digest(legacy)==legacy_hash,'GUARD_LEGACY_CHANGED')
  require(not (app/'current').exists() and not (app/'other').exists(),'GUARD_PARENT_CHANGED')
  # Guard is public read-only; non-root cannot change it or the dedicated parent.
  denied=cmd(['runuser','-u','nobody','--','/usr/bin/python3','-c','from pathlib import Path; p=Path("/opt/traceflow/shared/release-guard/release-guard.json"); assert p.read_bytes(); p.write_bytes(b"bad")'],False)
  require(json.loads(layout.guard.read_bytes())['phase']=='probe','GUARD_NONROOT_CHANGED')
  return {**proof,'status':'GUARD_SANDBOX_PASS','nonRootReadOnly':True,'legacyPreserved':True,'source':'actual Oracle Linux ARM64 mount namespace','cleanup':True}
 finally:
  for unit in units:cmd(['systemctl','stop',unit],False);cmd(['systemctl','reset-failed',unit],False)
  if unit_file and unit_file.exists():require(file_digest(unit_file)==unit_hash,'GUARD_UNIT_CHANGED');unit_file.unlink();cmd(['systemctl','daemon-reload'])
  require(app.stat().st_ino==inode and not app.is_symlink(),'GUARD_LAB_OWNER');shutil.rmtree(app)
if __name__=='__main__':
 try:
  if len(sys.argv)>1 and sys.argv[1]=='probe':probe()
  else:print(json.dumps(main()))
 except BaseException as e:print(json.dumps({'status':'FAIL','code':str(e) if isinstance(e,ops.Refused) else type(e).__name__}));sys.exit(1)
