"""Real bounded file IO; services/MySQL are not used. Root identity is mapped locally."""
import contextlib,hashlib,os,sys,tarfile,tempfile,tracemalloc,unittest,uuid
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
sys.path.insert(0,str(Path(__file__).parents[1]/'lib'))
import operational_io as io
import recovery_snapshot as snapshot
from release_contract import Refused

class StreamingTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(dir=Path(__file__).parents[2]/'build');self.addCleanup(self.temp.cleanup)
  self.root=Path(self.temp.name);self.root.chmod(0o700)
  self.storage=self.root/'storage';self.storage.mkdir(mode=0o700)
  self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
  self.stack.enter_context(mock.patch.object(snapshot,'STORAGE',self.storage))
  self.stack.enter_context(mock.patch.object(snapshot.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=os.getuid())))
  secure=io.secure_stream
  self.stack.enter_context(mock.patch.object(snapshot,'secure_stream',side_effect=lambda p,uid,maximum,mode:secure(p,os.getuid(),maximum,mode)))
 def file(self,size=32):
  p=self.storage/str(uuid.uuid4());block=b'non-sensitive-fixture-'*49932;remaining=size
  with p.open('xb') as f:
   os.fchmod(f.fileno(),0o600)
   while remaining:
    b=block[:min(remaining,len(block))];f.write(b);remaining-=len(b)
  return p
 def test_real_300_mib_stream_copy_hash_pack_and_readback_bounded_memory(self):
  for _ in range(6):self.file(50*1024**2)
  destination=self.root/'copied';destination.mkdir(mode=0o700)
  tracemalloc.start()
  try:
   with mock.patch.object(Path,'read_bytes',side_effect=AssertionError('whole-file read prohibited')):
    inventory=snapshot.storage_copy(destination)
    self.assertEqual(sum(x['size'] for x in inventory.values()),300*1024**2)
    self.assertEqual(snapshot.storage_copy(None),inventory)
    scratch=self.root/'scratch';scratch.mkdir(mode=0o700);(scratch/'evidence').mkdir(mode=0o700)
    for p in destination.iterdir():p.rename(scratch/'evidence'/p.name)
    inv={'evidence/'+n:v for n,v in inventory.items()};archive=self.root/'payload.tar'
    snapshot.pack_archive(scratch,archive,inv)
    with tarfile.open(archive) as tar:
     for entry in tar:
      h=hashlib.sha256();count=0
      with tar.extractfile(entry) as incoming:
       for chunk in iter(lambda:incoming.read(1024**2),b''):h.update(chunk);count+=len(chunk)
      self.assertEqual({'size':count,'sha256':h.hexdigest()},inv[entry.name]);self.assertEqual(entry.mode,0o600)
   self.assertLess(tracemalloc.get_traced_memory()[1],10*1024**2)
  finally:tracemalloc.stop()
 def test_aggregate_individual_and_file_count_limits_refuse(self):
  self.file(40);self.file(40)
  for name,value in [('MAX_STORAGE_BYTES',79),('MAX_STORAGE_FILE_BYTES',39),('MAX_STORAGE_FILES',1)]:
   with mock.patch.object(snapshot,name,value),self.assertRaisesRegex(Refused,'STORAGE_SIZE_REQUIRES_REVIEW'):snapshot.storage_copy(None)
 def test_exact_limits_pass_without_fabricating_file_size(self):
  p=self.file(80)
  with mock.patch.object(snapshot,'MAX_STORAGE_BYTES',80),mock.patch.object(snapshot,'MAX_STORAGE_FILE_BYTES',80):
   result=snapshot.storage_copy(None)
  self.assertEqual(result[p.name],{'sha256':io.file_digest(p),'size':80})
 def test_custody_symlink_hardlink_and_permissions_refused(self):
  p=self.file()
  with mock.patch.object(snapshot.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=os.getuid()+1)),self.assertRaisesRegex(Refused,'STORAGE_OWNER'):snapshot.storage_copy(None)
  p.chmod(0o640)
  with self.assertRaises(Refused):snapshot.storage_copy(None)
  p.chmod(0o600);link=self.storage/str(uuid.uuid4());link.symlink_to(p)
  with self.assertRaises(Refused):snapshot.storage_copy(None)
  link.unlink();os.link(p,link)
  with self.assertRaises(Refused):snapshot.storage_copy(None)
 def test_secure_stream_detects_replacement_and_mutation(self):
  p=self.file();other=self.file()
  with self.assertRaisesRegex(Refused,'SOURCE_CHANGED'):
   with io.secure_stream(p,os.getuid(),100,0o600) as stream:
    stream.read(1);os.replace(other,p)
  with self.assertRaisesRegex(Refused,'SOURCE_CHANGED'):
   with io.secure_stream(p,os.getuid(),100,0o600) as stream:
    stream.read(1)
    with p.open('ab') as f:f.write(b'x')
 def pack_fixture(self):
  p=self.root/'database.sql';io.private_write(p,b'non-sensitive SQL fixture')
  return p,{'database.sql':{'size':p.stat().st_size,'sha256':io.file_digest(p)}}
 def test_pack_rejects_hash_size_unknown_paths_and_existing_destination(self):
  p,inv=self.pack_fixture()
  for field,value in [('sha256','0'*64),('size',p.stat().st_size+1)]:
   bad={'database.sql':dict(inv['database.sql'],**{field:value})}
   with self.assertRaisesRegex(Refused,'ARCHIVE_SOURCE_CHANGED'):snapshot.pack_archive(self.root,self.root/str(uuid.uuid4()),bad)
  with self.assertRaisesRegex(Refused,'ARCHIVE_MEMBER'):snapshot.pack_archive(self.root,self.root/'bad.tar',{'../database.sql':inv['database.sql']})
  target=self.root/'exists';io.private_write(target,b'preserved')
  with self.assertRaises(FileExistsError):snapshot.pack_archive(self.root,target,inv)
  self.assertEqual(target.read_bytes(),b'preserved')
 def test_pack_budget_is_checked_before_creating_archive(self):
  p,inv=self.pack_fixture();target=self.root/'too-large'
  with mock.patch.object(snapshot,'MAX_ARCHIVE_BYTES',1024),self.assertRaisesRegex(Refused,'BACKUP_SIZE_REVIEW'):snapshot.pack_archive(self.root,target,inv)
  self.assertFalse(target.exists())
 def test_interrupt_is_not_converted_to_a_completed_archive(self):
  p,inv=self.pack_fixture();before=io.file_digest(p)
  def stop():raise KeyboardInterrupt()
  with self.assertRaises(KeyboardInterrupt):snapshot.pack_archive(self.root,self.root/'interrupted',inv,stop)
  self.assertEqual(io.file_digest(p),before)
 def test_plaintext_budgets_fit_unchanged_external_limit(self):
  self.assertEqual(snapshot.MAX_SET,512*1024**2)
  self.assertGreaterEqual(snapshot.MAX_STORAGE_BYTES,300*1024**2)
  budgets=snapshot.MAX_STORAGE_BYTES+snapshot.MAX_DATABASE_BYTES+snapshot.MAX_SNAPSHOT_BYTES+snapshot.MAX_MANIFEST_BYTES+4*65536+8*1024**2
  self.assertLess(budgets,snapshot.MAX_ARCHIVE_BYTES)

if __name__=='__main__':unittest.main()
