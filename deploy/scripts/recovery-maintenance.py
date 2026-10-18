#!/usr/bin/env python3
"""Manual supervised run, timer run, or independent recovery. No implicit activation."""
import argparse,contextlib,os,resource,signal,sys
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from backup_maintenance import Cycle,public_code,TERMINAL
from backup_runtime import LinuxOperations,ROOT,POLICY,read_policy
from release_contract import require,private_json,exclusive_lock,trusted_path,encoded


def main():
 resource.setrlimit(resource.RLIMIT_CORE,(0,0));os.umask(0o077)
 p=argparse.ArgumentParser();p.add_argument('action',choices=['run','finalize','recover']);p.add_argument('--mode',choices=['timer','supervised'],default='timer');p.add_argument('--authorization');a=p.parse_args()
 require(os.geteuid()==0,'ROOT_MAINTENANCE_REQUIRED')
 release=Path(__file__).resolve().parents[2];ops=LinuxOperations(release)
 for path in (ROOT.parent,ROOT.parent/'sets',ROOT,ROOT/'runs'):
  path.mkdir(mode=0o700,exist_ok=True);trusted_path(path,directory=True,uid=0);require(path.stat().st_mode&0o777==0o700,'MAINTENANCE_STATE_MODE')
 # Common lock order: deployment/migration first, then backup ledger. Capture reuses
 # the in-process lease instead of opening a second lock (which would deadlock).
 with exclusive_lock(ops.layout.state/'operation.lock'),exclusive_lock(ROOT.parent/'operation.lock'):
  cycle=Cycle(ops,ROOT)
  try:
   if a.action!='run':
    if not (ROOT/'active.json').exists():result={'status':'NO_PENDING_MAINTENANCE'}
    else:
     r=private_json(ROOT/'active.json')
     if r['status'] in TERMINAL:result=r
     else:
      require(r['status']!='INTERVENTION_REQUIRED','MANUAL_INTERVENTION_REQUIRED')
      ops.references(r['policy']);ops.credential(r['policy']);result=cycle.recover(r)
   else:
    policy=read_policy();supervised=private_json(Path(a.authorization).absolute()) if a.authorization else None
    require(a.mode!='supervised' or supervised is not None,'SUPERVISED_AUTH_REQUIRED')
    result=cycle.run(policy,a.mode,supervised)
   return {k:result[k] for k in ('status','runId','backupVerified','applicationRestored','credentialClosed') if k in result}
  except BaseException as e:
   code=public_code(e)
   # Never erase an incomplete run or recover over a different operation.
   with contextlib.suppress(BaseException):ops.emergency(code)
   raise
  finally:
   with contextlib.suppress(BaseException):ops.close_credential()
if __name__=='__main__':
 def stop(*_):raise RuntimeError('signal')
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 try:result=main()
 except BaseException as e:
  print(encoded({'status':'FAIL','code':public_code(e),'secretsPrinted':False}).decode(),end='');sys.exit(1)

 print(encoded(result).decode(),end='')
 sys.exit(0 if result['status'] in ('COMPLETE','NO_PENDING_MAINTENANCE') else 1)
