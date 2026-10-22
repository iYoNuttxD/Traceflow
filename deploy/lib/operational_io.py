"""Bounded operational IO. No implicit environment, credentials or database access."""
import contextlib, hashlib, json, os, re, selectors, signal, stat, subprocess, time
from pathlib import Path
from release_contract import Refused
ENV = {"PATH":"/usr/sbin:/usr/bin:/sbin:/bin", "HOME":"/nonexistent", "LANG":"C.UTF-8", "TZ":"UTC", "MYSQL_HISTFILE":"/dev/null"}

def require(v,c):
 if not v:raise Refused(c)

def digest(b):return hashlib.sha256(b).hexdigest()

def encoded(v):return (json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=True)+'\n').encode()

def unique(data):
 def pairs(items):
  d={}
  for k,v in items:require(k not in d,'DUPLICATE_JSON');d[k]=v
  return d
 return json.loads(data,object_pairs_hook=pairs,parse_constant=lambda _:require(False,'JSON_NUMBER'))

def file_digest(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def identity_stat(s):return (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_size,s.st_mtime_ns,s.st_ctime_ns)

def secure_read(path,uid=0,maximum=2*1024*1024,mode=None):
 path=Path(path);require(path.is_absolute(),'ABSOLUTE_SOURCE_REQUIRED');before=path.lstat()
 require(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_uid==uid and not before.st_mode&0o022 and before.st_size<=maximum,'PRIVATE_SOURCE_UNSAFE')
 if mode is not None:require(before.st_mode&0o777==mode,'PRIVATE_SOURCE_MODE')
 for a in path.parents:require(not a.is_symlink() and a.is_dir() and a.stat().st_uid in (0,uid) and not a.stat().st_mode&0o022,'SOURCE_ANCESTOR_UNSAFE')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  with os.fdopen(fd,'rb') as f:
   require(identity_stat(os.fstat(f.fileno()))==identity_stat(before),'SOURCE_REPLACED');data=f.read(maximum+1);after=os.fstat(f.fileno())
  require(len(data)<=maximum and identity_stat(before)==identity_stat(after)==identity_stat(path.lstat()),'SOURCE_CHANGED');return data
 except BaseException:raise

@contextlib.contextmanager
def secure_stream(path,uid=0,maximum=2*1024*1024,mode=None):
 """Read a pinned regular file incrementally; verify custody before and after IO."""
 path=Path(path);require(path.is_absolute(),'ABSOLUTE_SOURCE_REQUIRED');before=path.lstat()
 require(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_uid==uid and
         not before.st_mode&0o022 and 0<=before.st_size<=maximum,'PRIVATE_SOURCE_UNSAFE')
 if mode is not None:require(before.st_mode&0o777==mode,'PRIVATE_SOURCE_MODE')
 for parent in path.parents:
  require(not parent.is_symlink() and parent.is_dir() and parent.stat().st_uid in (0,uid) and
          not parent.stat().st_mode&0o022,'SOURCE_ANCESTOR_UNSAFE')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as stream:
  require(identity_stat(os.fstat(stream.fileno()))==identity_stat(before),'SOURCE_REPLACED')
  yield stream
  after=os.fstat(stream.fileno());current=path.lstat()
  require(after.st_nlink==current.st_nlink==1 and
          identity_stat(before)==identity_stat(after)==identity_stat(current),'SOURCE_CHANGED')


def tool(args,input=None,timeout=60,pass_fds=(),output=None,maximum=16*1024**2,benign_stderr=b''):
 require(isinstance(benign_stderr,bytes) and len(benign_stderr)<=128,'TOOL_STDERR_CONTRACT')
 require(input is None or isinstance(input,bytes) and len(input)<=128*1024,'TOOL_INPUT_LIMIT')
 p=subprocess.Popen([str(x) for x in args],stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=ENV,pass_fds=pass_fds,start_new_session=True)
 sel=selectors.DefaultSelector();sel.register(p.stdout,selectors.EVENT_READ,'out');sel.register(p.stderr,selectors.EVENT_READ,'err')
 pending=memoryview(input) if input is not None else None
 if pending is not None:
  require(len(pending)<=128*1024,'TOOL_INPUT_LIMIT')
  if pending:
   os.set_blocking(p.stdin.fileno(),False);sel.register(p.stdin,selectors.EVENT_WRITE,'in')
  else:p.stdin.close()
 data=bytearray();err=bytearray();size=0;deadline=time.monotonic()+timeout;group_pending=True
 try:
  while sel.get_map():
   require(time.monotonic()<deadline,'TOOL_TIMEOUT')
   for key,_ in sel.select(min(1,max(0,deadline-time.monotonic()))):
    if key.data=='in':
     try:sent=os.write(key.fileobj.fileno(),pending[:4096])
     except BrokenPipeError:raise Refused('TOOL_INPUT_CLOSED') from None
     pending=pending[sent:]
     if not pending:sel.unregister(key.fileobj);key.fileobj.close()
     continue
    b=os.read(key.fileobj.fileno(),65536)
    if not b:sel.unregister(key.fileobj);continue
    if key.data=='err':err+=b;require(len(err)<=65536,'TOOL_STDERR_LIMIT')
    else:
     size+=len(b);require(size<=maximum,'TOOL_OUTPUT_LIMIT')
     if output:output.write(b)
     else:data+=b
  p.wait(timeout=max(1,deadline-time.monotonic()))
  group_pending=False
  if p.returncode!=0 or bytes(err) not in (b'',benign_stderr):
   error=Refused('TOOL_FAILED_'+Path(args[0]).name.upper().replace('-','_'))
   if Path(args[0]).name in ('mysql','mysqldump'):
    found=re.search(rb'^ERROR ([1-9][0-9]{0,4}) \([A-Z0-9]{5}\)',bytes(err),re.M)
    if found and int(found[1])<=65535:error.mysqlCode=found[1].decode('ascii')
   raise error
  return bytes(data)
 finally:
  sel.close()
  try:
   if group_pending:
    # Still-unreaped session leader pins the PGID. Kill once BEFORE wait/reaping;
    # never signal a numerical group again after its identity can be reused.
    with contextlib.suppress(ProcessLookupError):os.killpg(p.pid,signal.SIGKILL)
    p.wait(5)
  finally:
   p.stdout.close();p.stderr.close()
   if p.stdin is not None and not p.stdin.closed:p.stdin.close()


def private_write(path,data):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
