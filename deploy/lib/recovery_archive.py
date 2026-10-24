"""Offline restore-set integrity. Never connects or loads recovered environment."""
import hashlib,json,os,re,tarfile
from pathlib import Path
MAX=512*1024**2
UUID=r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
FIXED={'database.sql','snapshot.json','set.json','recovery/runtime.env','recovery/api.env','recovery/github-worker.env','recovery/mysql-ca.pem'}
class Refused(Exception):pass
def require(v,c):
 if not v:raise Refused(c)
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def unique(data):
 def pairs(items):
  result={}
  for k,v in items:require(k not in result,'DUPLICATE_FIELD');result[k]=v
  return result
 return json.loads(data,object_pairs_hook=pairs)
def allowed(name):
 return name in FIXED or name.startswith('evidence/') and re.fullmatch(UUID+r'|\.uploads/'+UUID+r'/(?:part-'+UUID+r'|work-'+UUID+r'/'+UUID+r')',name[9:]) is not None

def unpack(archive,target,outer):
 require(archive.stat().st_size==outer['archive']['size'] and sha(archive)==outer['archive']['sha256'],'ARCHIVE_DIGEST')
 require(not target.exists(),'RESTORE_TARGET_EXISTS');target.mkdir(mode=0o700)
 seen=set();total=0
 with tarfile.open(archive,'r:') as tf:
  for ent in tf:
   require(allowed(ent.name) and ent.name not in seen and ent.type in (tarfile.REGTYPE,tarfile.AREGTYPE) and not ent.linkname and not ent.pax_headers and ent.mode==0o600 and ent.uid==ent.gid==0,'ARCHIVE_MEMBER')
   total+=ent.size;require(0<=ent.size<=MAX and total<=MAX and len(seen)<100000,'ARCHIVE_LIMIT')
   seen.add(ent.name);out=target/ent.name;out.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
   fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'wb') as f,tf.extractfile(ent) as incoming:
    remaining=ent.size
    while remaining:
     b=incoming.read(min(1048576,remaining));require(bool(b),'ARCHIVE_TRUNCATED');f.write(b);remaining-=len(b)
    f.flush();os.fsync(f.fileno())
 require(FIXED<=seen,'ARCHIVE_INCOMPLETE')
 require(sha(target/'set.json')==outer['innerManifestSha256'],'SET_DIGEST')
 inner=unique((target/'set.json').read_bytes())
 require(inner['formatVersion']==2 and inner['status']=='COMPLETE' and inner['application']=='TraceFlow','SET_FORMAT')
 for key in ('backupId','createdAtUtc','source','releaseId','runtimeManifestSha256','consistency'):require(inner[key]==outer[key],'SET_BINDING')
 actual={n:{'sha256':sha(target/n),'size':(target/n).stat().st_size} for n in seen-{'set.json'}}
 require(actual==inner['files'],'SET_INVENTORY')
 require(len(inner['schema']['migrations'])==68 and inner['schema']['chainSha256']==outer['chainSha256'],'MIGRATION_CHAIN')
 require(inner['accountsLocked'] is True and inner['servicesStopped'] is True and inner['queriesWarningCount']==0 and inner['operatorExternalWritersControlled'] is True,'CONSISTENCY')
 snapshot=unique((target/'snapshot.json').read_bytes())
 return inner,snapshot
