"""Private encrypted workspace for a manual, isolated restore rehearsal on macOS."""
import hashlib,json,os,plistlib,secrets,shutil,stat,subprocess,tempfile,uuid
from pathlib import Path
BASE=Path('/Users/daniel/Library/Application Support/TraceFlowRecovery')
ENV={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','HOME':'/nonexistent','LANG':'en_US.UTF-8'}
class Refused(Exception):pass
def require(v,c):
 if not v:raise Refused(c)
def run(args,data=None):
 p=subprocess.run([str(x) for x in args],input=data,stdin=None if data is not None else subprocess.DEVNULL,capture_output=True,env=ENV,timeout=90)
 require(p.returncode==0,'ENCRYPTED_VOLUME_'+str(args[1]).upper()+'_FAILED');return p.stdout
class EncryptedWorkspace:
 def __init__(self):
  self.run_id=uuid.uuid4().hex;self.base=BASE/('restore-lab-'+self.run_id);self.device=None;self.mount=None
 def __enter__(self):
  os.umask(0o077);self.base.mkdir(mode=0o700)
  self.owner=(self.base.stat().st_dev,self.base.stat().st_ino,self.base.stat().st_uid)
  self.image=self.base/'encrypted.sparsebundle'
  self.mount=Path(tempfile.mkdtemp(prefix='tfr-',dir='/private/tmp'))
  self.mount_owner=(self.mount.stat().st_dev,self.mount.stat().st_ino,self.mount.stat().st_uid)
  password=secrets.token_hex(32).encode()+b'\0'
  try:
   run(['/usr/bin/hdiutil','create','-size','4g','-fs','Case-sensitive APFS','-type','SPARSEBUNDLE','-encryption','AES-256','-stdinpass','-nospotlight','-volname','TraceFlowRestore',self.image],password)
   info=plistlib.loads(run(['/usr/bin/hdiutil','isencrypted','-plist',self.image]));require(info.get('encrypted') is True,'VOLUME_NOT_ENCRYPTED')
   result=plistlib.loads(run(['/usr/bin/hdiutil','attach','-stdinpass','-noautoopen','-mountpoint',self.mount,'-plist',self.image],password))
   row=next(x for x in result['system-entities'] if x.get('mount-point')==str(self.mount));self.device=row['dev-entry']
   require(self.device.startswith('/dev/disk') and os.path.ismount(self.mount),'MOUNT_IDENTITY');self.mount.chmod(0o700)
   require(self.mount.stat().st_uid==os.getuid() and self.mount.stat().st_mode&0o777==0o700,'MOUNT_PERMISSIONS')
   del password
   (self.mount/'.metadata_never_index').touch(mode=0o600)
   return self
  except BaseException:
   self.close();raise
 def close(self):
  if self.device:
   run(['/usr/bin/hdiutil','detach',self.device]);self.device=None
  if self.mount:
   require(not os.path.ismount(self.mount) and self.mount.parent==Path('/private/tmp') and self.mount.name.startswith('tfr-') and not self.mount.is_symlink(),'MOUNT_STILL_ACTIVE')
   if self.mount.exists():
    st=self.mount.stat();require((st.st_dev,st.st_ino,st.st_uid)==self.mount_owner,'MOUNT_REPLACED');self.mount.rmdir()
  if self.base.exists():
   st=self.base.stat();require(self.base.parent==BASE and not self.base.is_symlink() and (st.st_dev,st.st_ino,st.st_uid)==self.owner,'IMAGE_OWNERSHIP');shutil.rmtree(self.base)
 def __exit__(self,*_):self.close()
