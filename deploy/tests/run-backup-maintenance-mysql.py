#!/usr/bin/env python3
"""New loopback-only MySQL + synthetic data; integrates FSM/account transport/age.
Object Storage is an exclusive local copy. This is not a production rehearsal.
"""
import contextlib,hashlib,json,os,re,secrets,shutil,subprocess,sys,tempfile,time
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[2];sys.path[:0]=[str(ROOT/'deploy/lib'),str(ROOT/'deploy/tests')]
from persistence_lab import Lab
from activation_accounts import TextSession
from test_backup_maintenance import Fake,policy,authorization,NOW
import backup_maintenance as m
from release_contract import require,private_json,atomic_json,encoded,exclusive_lock
from operational_io import private_write,tool
AGE=Path('/private/tmp/tf06-pphl4q9v/public/age');MYSQL=Path('/opt/homebrew/opt/mysql')
def main():
 require(sys.platform=='darwin','MAC_DISPOSABLE_ONLY');os.umask(0o077)
 require(hashlib.sha256((AGE/'age').read_bytes()).hexdigest()=='4012dfc2725883beafb710894af4f599b7a94f8c8e0f51f02cc96ab8df33915e','LAB_AGE_HASH')
 root=Path(tempfile.mkdtemp(prefix='tf-maint-mysql-',dir='/private/tmp'));inode=root.stat().st_ino
 lab=Lab(root,MYSQL,'26.7.0',ROOT,'/opt/homebrew/opt/node@22/bin/node',AGE/'age');admin='tf_maint_admin_'+lab.runid;secret=secrets.token_hex(32)
 users=['tf_maint_api_'+lab.runid,'tf_maint_worker_'+lab.runid];runtime_secret=secrets.token_hex(32);original=subprocess.Popen
 checks=[]
 def launch(args,*a,**kw):
  if isinstance(args,list) and args[0]==str(MYSQL/'bin/mysqld') and any(str(x).startswith('--init-file=') for x in args):
   init=lab.root/'private/init.sql'
   with init.open('a') as f:
    f.write("\nCREATE USER '"+admin+"'@'127.0.0.1' IDENTIFIED BY '"+secret+"' REQUIRE SSL;\nGRANT ALL PRIVILEGES ON *.* TO '"+admin+"'@'127.0.0.1';\n")
    for u in users:f.write("CREATE USER '"+u+"'@'127.0.0.1' IDENTIFIED BY '"+runtime_secret+"' REQUIRE SSL ACCOUNT LOCK;\nGRANT SELECT ON `"+lab.schema+"`.* TO '"+u+"'@'127.0.0.1';\n")
    f.write('CREATE TABLE `'+lab.schema+'`.probe(id INT PRIMARY KEY,content VARCHAR(100));\nINSERT INTO `'+lab.schema+'`.probe VALUES(1,\'synthetic evidence\');\n')
  return original(args,*a,**kw)
 def query(sql,width=1):
  fd=os.open(credential,os.O_RDONLY|os.O_NOFOLLOW)
  args=[str(MYSQL/'bin/mysql'),'--defaults-file=/dev/fd/'+str(fd),'--no-login-paths','--protocol=TCP','--host=127.0.0.1','--port='+str(lab.port),'--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+str(lab.root/'ca.pem'),'--skip-reconnect','--batch','--raw','--skip-column-names','--skip-auto-rehash','--binary-mode','--local-infile=0','--connect-timeout=5','--default-character-set=utf8mb4','--unbuffered']
  try:
   with TextSession(args,fd) as s:
    rows,cid=s.query([{'id':'IDENTITY','sql':'SELECT JSON_ARRAY(@@server_uuid,@@port,VERSION())','width':3}]);require(rows['IDENTITY']==[[lab.uuid,lab.port,'26.7.0']],'LAB_SERVER_CHANGED')
    rows,after=s.query([{'id':'QUERY','sql':sql,'width':width}]);require(after==cid,'LAB_SESSION_CHANGED');return rows['QUERY']
  finally:os.close(fd)
 def mutate(locked):
  for user in users:query("ALTER USER '"+user+"'@'127.0.0.1' ACCOUNT "+('LOCK' if locked else 'UNLOCK'),0)
 def account_state(locked):require(query("SELECT JSON_ARRAY(User,account_locked) FROM mysql.user WHERE User IN ('"+"','".join(users)+"') ORDER BY User",2)==[[u,'Y' if locked else 'N'] for u in sorted(users)],'LAB_ACCOUNT_STATE')
 class DB(Fake):
  def __init__(self,base,mode,running):super().__init__(running);self.base=base;self.mode=mode;self.clock=NOW;self.env=lab.env
  def inspect(self,p):account_state(not self.running);return super().inspect(p)
  def lock_accounts(self):super().lock_accounts();mutate(True);account_state(True)
  def unlock_accounts(self):super().unlock_accounts();mutate(False);account_state(False)
  def verify_quiescent(self,p):super().verify_quiescent(p);account_state(True)
  def capture(self,p,path,lease):
   super().capture(p,path,lease)
   if self.mode=='capture-failure':raise m.Refused('LAB_CAPTURE_FAILED')
   fd=os.open(credential,os.O_RDONLY|os.O_NOFOLLOW)
   try:
    dump=tool([str(MYSQL/'bin/mysqldump'),'--defaults-file=/dev/fd/'+str(fd),'--no-login-paths','--protocol=TCP','--host=127.0.0.1','--port='+str(lab.port),'--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+str(lab.root/'ca.pem'),'--single-transaction','--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF','--skip-comments',lab.schema],pass_fds=(fd,),timeout=15)
   finally:os.close(fd)
   require(b'synthetic evidence' in dump and secret.encode() not in dump,'LAB_DUMP_CONTENT')
   tool([str(AGE/'age'),'-r',recipient,'-o',str(self.base/'payload.age')],input=dump,timeout=10)
   self.dump_hash=hashlib.sha256(dump).hexdigest();del dump
  def publish(self,p,run,expires):
   super().publish(p,run,expires)
   if self.mode=='network-failure':raise m.Refused('LAB_NETWORK_FAILED')
   raw=(self.base/'payload.age').read_bytes();private_write(self.base/'external.age',raw)
   if self.mode=='integrity-failure':(self.base/'external.age').write_bytes(b'corrupt')
   require(hashlib.sha256((self.base/'external.age').read_bytes()).digest()==hashlib.sha256(raw).digest(),'LAB_READBACK_FAILED')
   recovered=tool([str(AGE/'age'),'-d','-i',str(root/'synthetic-age-key'),str(self.base/'external.age')],timeout=10)
   require(hashlib.sha256(recovered).hexdigest()==self.dump_hash,'LAB_DECRYPT_INTEGRITY');del recovered
  def verify_running(self,p):super().verify_running(p);account_state(False)
  def assert_stopped_locked(self):super().assert_stopped_locked();account_state(True)
 try:
  with mock.patch.object(subprocess,'Popen',side_effect=launch):lab.start()
  lab.credentials['admin']=(admin,secret)
  owned=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',str(lab.process.pid),'-iTCP:'+str(lab.port),'-sTCP:LISTEN'],capture_output=True,check=True)
  require(('127.0.0.1:'+str(lab.port)).encode() in owned.stdout and b'*:' not in owned.stdout,'LAB_BIND')
  credential=lab.root/'private/admin.cnf';private_write(credential,('[client]\nuser='+admin+'\npassword="'+secret+'"\n').encode())
  p=subprocess.run([str(AGE/'age-keygen'),'-o',str(root/'synthetic-age-key')],capture_output=True,timeout=10);require(p.returncode==0,'LAB_KEYGEN')
  recipient=tool([str(AGE/'age-keygen'),'-y',str(root/'synthetic-age-key')]).decode().strip()
  before=query('SELECT JSON_ARRAY(id,content) FROM `'+lab.schema+'`.probe',2)
  for mode,running in [('success',True),('first-publication',False),('capture-failure',True),('network-failure',True),('integrity-failure',True)]:
   mutate(not running);base=root/mode;base.mkdir(mode=0o700);(base/'runs').mkdir(mode=0o700);ops=DB(base,mode,running);cycle=m.Cycle(ops,base);p=policy()
   with exclusive_lock(base/'operation.lock'):result=cycle.run(p,'supervised',authorization(p))
   expected='COMPLETE' if mode in ('success','first-publication') else 'BACKUP_FAILED_APPLICATION_RESTORED'
   require(result['status']==expected and result['applicationRestored']==running,'LAB_CYCLE_RESULT');account_state(not running)
   require(query('SELECT JSON_ARRAY(id,content) FROM `'+lab.schema+'`.probe',2)==before,'LAB_DATA_CHANGED')
   require(not any(secret.encode() in f.read_bytes() or runtime_secret.encode() in f.read_bytes() for f in base.rglob('*.json')),'LAB_SECRET_LOGGED')
   checks.append({'test':mode,'status':'PASS','cycleStatus':result['status'],'dataUnchanged':True,'accountsRestored':True})
  mutate(True);account_state(True)
  remaining=query("SELECT JSON_ARRAY(COUNT(*)) FROM performance_schema.threads WHERE PROCESSLIST_USER='"+admin+"' AND PROCESSLIST_ID<>CONNECTION_ID()",1);require(remaining==[[0]],'LAB_SESSIONS_REMAIN')
  return {'status':'MYSQL_MAINTENANCE_LAB_PASS','mysql':'26.7.0','port':lab.port,'serverUuid':lab.uuid,'checks':checks,'migrationsExecuted':0,'productionConnections':False,'cleanup':True,'limitations':['Local synthetic users/schema; production identity/audit are not replaced or bypassed.','Services and object store are simulated here; Linux cgroup/age tested separately.']}
 finally:
  lab.stop();require(lab.process is None or lab.process.poll() is not None,'LAB_SERVER_REMAINS');require(root.stat().st_ino==inode and not root.is_symlink() and root.name.startswith('tf-maint-mysql-'),'LAB_CLEANUP_OWNER');shutil.rmtree(root)
if __name__=='__main__':
 try:print(json.dumps(main()))
 except BaseException as e:print(json.dumps({'status':'FAIL','code':m.public_code(e),'secretsPrinted':False}));sys.exit(1)
