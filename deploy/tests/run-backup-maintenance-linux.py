#!/usr/bin/env python3
"""Owned local Lima lifecycle lab; synthetic writers/object store, never real DB/OCI."""
import contextlib,hashlib,json,os,platform,secrets,shutil,signal,socket,subprocess,sys,time,uuid
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2];sys.path[:0]=[str(ROOT/'deploy/lib'),str(ROOT/'deploy/tests')]
import backup_maintenance as m
from test_backup_maintenance import Fake,policy,authorization,NOW
from release_contract import require,encoded,private_json,atomic_json,exclusive_lock,file_digest
from operational_io import private_write,tool

def command(args,check=True):
 p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,timeout=25)
 require(not check or p.returncode==0,'LAB_COMMAND_FAILED_'+Path(args[0]).name.upper().replace('-','_'));return p.stdout.decode().strip()
def props(unit):return dict(x.split('=',1) for x in command(['systemctl','show',unit,'-p','MainPID','-p','ActiveState','-p','ControlGroup','-p','Result']).splitlines())
class Native(Fake):
 def __init__(self,base):
  self.base=base;self.settings=private_json(base/'settings.json');super().__init__(self.settings['running']);self.clock=time.time();self.state=private_json(base/'state.json');self.units=self.settings['units']
 def wall(self):return time.time()
 def save_state(self,v):self.state=v;atomic_json(self.base/'state.json',v)
 def load_state(self):return private_json(self.base/'state.json')
 def inspect(self,p,mode='timer'):self.call('inspect');return self.load_state(),self.settings['running']
 def stop(self):
  self.call('stop')
  for unit in self.units:command(['systemctl','stop',unit])
  self.running=False
 def start_one(self,index):
  command(['systemctl','start',self.units[index]])
 def start_api(self):self.call('api');self.start_one(0);self.running=True
 def start_worker(self):self.call('worker');self.start_one(1)
 def verify_running(self,p):
  self.call('running');require(all(props(u)['MainPID']!='0' for u in self.units),'LAB_WRITERS_MISSING')
 def verify_quiescent(self,p):
  self.call('quiet');require(all(props(u)['MainPID']=='0' for u in self.units),'LAB_WRITERS_REMAIN')
 def capture(self,p,path,lease):
  self.call('capture');lease.check(private_json(path),self.load_state())
  raw=(Path(os.environ['CREDENTIALS_DIRECTORY'])/'synthetic-admin').read_bytes()
  require(hashlib.sha256(raw).hexdigest()==self.settings['secretHash'],'LAB_CREDENTIAL')
  require(all(raw not in x.encode() for x in sys.argv) and all(raw not in v.encode() for k,v in os.environ.items()),'LAB_SECRET_EXPOSED')
  require((self.base/'objects').is_dir(),'LAB_OBJECT_STORE')
  private_write(self.base/'capture-entered',b'entered')
  mode=self.settings['mode'].removeprefix('reconciled-')
  if mode=='killed':os.kill(os.getpid(),signal.SIGKILL)
  if mode=='timeout':time.sleep(60)
  if mode=='failed':raise m.Refused('LAB_CAPTURE_FAILURE')
  if mode=='term':os.kill(os.getpid(),signal.SIGTERM)
  # Synthetic content, encrypted with the already-installed native age binary.
  tool(['/opt/traceflow-tools/age-1.3.2/age','-r',self.settings['recipient'],'-o',str(self.base/'payload.age')],input=b'SYNTHETIC DISPOSABLE DATA\n',timeout=10)
 def publish(self,p,run,expires):
  self.call('publish');raw=(self.base/'payload.age').read_bytes();require(raw.startswith(b'age-encryption.org/v1\n'),'LAB_CIPHER')
  private_write(self.base/'objects'/'payload.age',raw);require(file_digest(self.base/'objects'/'payload.age')==file_digest(self.base/'payload.age'),'LAB_READBACK')
 def assert_stopped_locked(self):self.verify_quiescent(None);require(self.locked,'LAB_LOCKED')
 def close_credential(self):self.call('credential')

def child(base,action):
 ops=Native(base);cycle=m.Cycle(ops,base/'maintenance')
 def stopped(*_):raise m.Refused('LAB_SIGTERM')
 signal.signal(signal.SIGTERM,stopped)
 with exclusive_lock(base/'operation.lock'):
  if action=='run':result=cycle.run(private_json(base/'policy.json'),'supervised',private_json(base/'authorization.json'))
  else:result=cycle.recover()
 atomic_json(base/('child-'+action+'.json'),{'status':result['status'],'backupVerified':result.get('backupVerified',False)})
 if action=='run' and result['status']!='COMPLETE':sys.exit(1)
def main():
 require(os.geteuid()==0 and socket.gethostname()=='lima-tf072c' and platform.machine()=='aarch64','LOCAL_LIMA_ONLY')
 require('9.8' in Path('/etc/oracle-release').read_text(),'ORACLE98_ONLY')
 os.umask(0o077);run=uuid.uuid4().hex;parent=Path('/var/lib')/('tf-maintenance-lab-'+run);parent.mkdir(mode=0o700);inode=parent.stat().st_ino
 key=Path('/var/lib/systemd/credential.secret');key_existed=key.exists();new_key_hash=None;units=[];unit_files={};results=[]
 try:
  secret=secrets.token_hex(32).encode();plain=b'[client]\nuser=synthetic\npassword="'+secret+b'"\n'
  encrypted=subprocess.run(['/usr/bin/systemd-creds','encrypt','--with-key=host','--name=synthetic-admin','-','-'],input=plain,capture_output=True,timeout=15)
  require(encrypted.returncode==0,'LAB_CREDENTIAL_ENCRYPT');new_key_hash=file_digest(key) if not key_existed else None
  cipher=parent/'synthetic.cred';private_write(cipher,encrypted.stdout)
  dec=subprocess.run(['/usr/bin/systemd-creds','decrypt','--name=synthetic-admin','-','-'],input=encrypted.stdout,capture_output=True,timeout=15)
  require(dec.returncode==0 and dec.stdout==plain,'LAB_CREDENTIAL_ROUNDTRIP');results.append({'test':'host_credential_encryption_roundtrip','status':'PASS'})
  generated=subprocess.run(['/opt/traceflow-tools/age-1.3.2/age-keygen','-o',str(parent/'age-key')],capture_output=True,timeout=10);require(generated.returncode==0,'LAB_AGE_KEYGEN')
  recipient=command(['/opt/traceflow-tools/age-1.3.2/age-keygen','-y',str(parent/'age-key')])
  for mode,running in [('success',True),('initial',False),('failed',True),('term',True),('killed',True),('timeout',True),
                       ('reconciled-success',False),('reconciled-failed',False),('reconciled-term',False),('reconciled-killed',False),('reconciled-timeout',False)]:
   base=parent/mode;base.mkdir(mode=0o700);(base/'maintenance').mkdir(mode=0o700);(base/'maintenance'/'runs').mkdir(mode=0o700);(base/'objects').mkdir(mode=0o700)
   writer_units=['tf-maint-'+run+'-'+mode+'-'+x+'.service' for x in ('api','worker')];unit='tf-maint-'+run+'-'+mode+'.service';units.extend([unit,*writer_units])
   for writer in writer_units:
    path=Path('/run/systemd/system')/writer;raw=b'[Service]\nType=exec\nKillMode=control-group\nExecStart=/usr/bin/python3 -c \"import subprocess,time;subprocess.Popen([\'/usr/bin/sleep\',\'300\']);time.sleep(300)\"\n'
    private_write(path,raw);unit_files[path]=hashlib.sha256(raw).hexdigest()
   command(['systemctl','daemon-reload'])
   settings={'mode':mode,'running':running,'units':writer_units,'secretHash':hashlib.sha256(plain).hexdigest(),'recipient':recipient};atomic_json(base/'settings.json',settings)
   prior=Fake(running).state
   if mode.startswith('reconciled-'):
    prior.update(status='reconciled-v2',phase='first-recovery-reconciled-v2',runId='a'*32,
                 recoveryProof={'kind':'activation-recovery','runId':'a'*32})
   atomic_json(base/'state.json',prior)
   p=policy();now=time.time();p['issuedAt']=m.stamp(now-1);p['expiresAt']=p['capacity']['expiresAt']=m.stamp(now+3600)
   p['capacity']['month']=time.strftime('%Y-%m',time.gmtime(now));atomic_json(base/'policy.json',p)
   a=authorization(p);a['issuedAt']=m.stamp(now-1);a['expiresAt']=m.stamp(now+599);atomic_json(base/'authorization.json',a)
   ops=Native(base)
   if running:ops.start_api();ops.start_worker()
   script=str(Path(__file__).resolve());finish='/usr/bin/python3 -I -B '+script+' child '+str(base)+' recover'
   command(['systemd-run','--quiet','--unit='+unit,'--property=Type=exec','--property=LoadCredentialEncrypted=synthetic-admin:'+str(cipher),
     '--property=KillMode=control-group','--property=RuntimeMaxSec='+('3' if mode.endswith('timeout') else '60'),'--property=TimeoutStopSec=30',
     '--property=LimitCORE=0','--property=ExecStopPost='+finish,'/usr/bin/python3','-I','-B',script,'child',str(base),'run'])
   end=time.monotonic()+65
   while not (base/'child-recover.json').exists() and time.monotonic()<end:time.sleep(.1)
   require((base/'child-recover.json').exists(),'LAB_FINALIZER_MISSING')
   r=private_json(base/'maintenance'/'active.json');expected='COMPLETE' if mode in ('success','initial','reconciled-success') else ('BACKUP_FAILED_APPLICATION_RESTORED' if running else 'BACKUP_FAILED_PREACTIVATION_SAFE')
   print(json.dumps({'scenario':mode,'status':r['status'],'failure':r.get('failure'),'recoveryFailure':r.get('recoveryFailure'),'phase':r['phase']}),flush=True)
   require(r['status']==expected and r['credentialClosed'] and r['applicationRestored']==running,'LAB_RECOVERY_STATE')
   require(private_json(base/'state.json')==prior,'LAB_STATE_RESTORED')
   for w in writer_units:
    require((props(w)['MainPID']!='0')==running,'LAB_WRITER_STATE');command(['systemctl','stop',w])
    group=props(w)['ControlGroup'];cg=Path('/sys/fs/cgroup')/group.lstrip('/')/'cgroup.procs' if group else None
    require(cg is None or not cg.exists() or not cg.read_text().strip(),'LAB_DESCENDANT_REMAINS')
   if mode in ('success','initial','reconciled-success'):
    recovered=subprocess.run(['/opt/traceflow-tools/age-1.3.2/age','-d','-i',str(parent/'age-key'),str(base/'objects'/'payload.age')],capture_output=True,timeout=10)
    require(recovered.returncode==0 and recovered.stdout==b'SYNTHETIC DISPOSABLE DATA\n','LAB_RESTORE_INTEGRITY')
   journal=command(['journalctl','-u',unit,'--no-pager','--output=cat']);require(secret.decode() not in journal and plain.decode() not in journal,'LAB_SECRET_LOGGED')
   results.append({'test':mode,'status':'PASS','final':r['status'],'writersRestored':running,'cgroupEmptyAfterCleanup':True,'credentialLeak':False})
  return {'status':'LINUX_MAINTENANCE_LAB_PASS','platform':platform.machine(),'os':Path('/etc/oracle-release').read_text().strip(),'checks':results,'productionConnections':False,'limitations':['Synthetic writers and object store; no HeatWave or OCI connection.','No actual machine reboot; independent recovery after SIGKILL/timeout was executed.', 'Reconciled provenance is synthetic in this process lab; the full real receipt protocol is covered by Python filesystem integration tests.']}
 finally:
  for unit in units:command(['systemctl','stop',unit],False);require(props(unit)['MainPID']=='0','LAB_CLEANUP_PROCESS');command(['systemctl','reset-failed',unit],False)
  for path,sha in unit_files.items():
   require(file_digest(path)==sha,'LAB_UNIT_CHANGED');path.unlink()
  command(['systemctl','daemon-reload'])
  require(parent.stat().st_ino==inode and not parent.is_symlink() and parent.name=='tf-maintenance-lab-'+run,'LAB_CLEANUP_OWNER');shutil.rmtree(parent)
  if new_key_hash is not None:
   require(file_digest(key)==new_key_hash,'LAB_HOST_KEY_CHANGED');key.unlink()
if __name__=='__main__':
 try:
  if len(sys.argv)>1 and sys.argv[1]=='child':child(Path(sys.argv[2]),sys.argv[3])
  else:print(json.dumps(main()))
 except BaseException as e:
  print(json.dumps({'status':'FAIL','code':m.public_code(e)}));sys.exit(1)
