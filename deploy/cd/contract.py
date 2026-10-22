"""Small package and promotion contract shared by deployer and isolated tests."""
import hashlib,json,os,re,stat,tarfile,time
from pathlib import Path,PurePosixPath
SHA=re.compile('[a-f0-9]{40}\\Z');DIGEST=re.compile('[a-f0-9]{64}\\Z')
def need(v,code):
 if not v:raise ValueError(code)
def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def canonical(v):return (json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
def unpack(package,dest,expected):
 need(DIGEST.fullmatch(expected) and sha(package)==expected,'ARTIFACT_DIGEST')
 need(not dest.exists(),'EXCLUSIVE_DESTINATION')
 with tarfile.open(package,'r:gz') as t:
  members=t.getmembers();seen=set();total=0
  for m in members:
   p=PurePosixPath(m.name)
   need(not p.is_absolute() and '..' not in p.parts and str(p)==m.name and m.name not in seen,'ARCHIVE_PATH');seen.add(m.name)
   need(m.isfile() or m.issym(),'ARCHIVE_TYPE');need(m.mode&0o6000==0,'ARCHIVE_MODE')
   need(m.name=='cd-manifest.json' or p.parts[0] in ('backend','frontend'),'ARCHIVE_SCOPE')
   if m.issym():
    need(not m.linkname.startswith('/') and (dest/p.parent/m.linkname).resolve().is_relative_to(dest.resolve()),'ARCHIVE_LINK')
   total+=m.size;need(total<=2*1024**3 and len(seen)<=50000,'ARCHIVE_CAPACITY')
  need('cd-manifest.json' in seen,'MANIFEST_MISSING')
  manifest=json.load(t.extractfile('cd-manifest.json'));need(manifest.get('kind')=='traceflow-clean-cd' and manifest.get('formatVersion')==1 and SHA.fullmatch(manifest.get('commit','')),'MANIFEST_FORMAT')
  need(seen==set(manifest['files'])|{'cd-manifest.json'},'MANIFEST_INVENTORY')
  dest.mkdir(parents=True,mode=0o755);dest.chmod(0o755)
  for m in sorted(members,key=lambda x:x.issym()):
   target=dest/m.name;target.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
   parent=target.parent
   while parent!=dest:
    need(not parent.is_symlink(),'ARCHIVE_PARENT_LINK');parent.chmod(0o755);parent=parent.parent
   if m.issym():os.symlink(m.linkname,target)
   else:
    with t.extractfile(m) as src,target.open('xb') as out:
     for b in iter(lambda:src.read(1024*1024),b''):out.write(b)
    target.chmod(0o755 if m.mode&0o111 else 0o644)
  for name,entry in manifest['files'].items():
   p=dest/name
   if 'link' in entry:need(p.is_symlink() and os.readlink(p)==entry['link'],'MANIFEST_LINK')
   else:need(not p.is_symlink() and p.stat().st_size==entry['bytes'] and sha(p)==entry['sha256'] and p.stat().st_mode&0o7777==entry['mode'],'MANIFEST_FILE')
  return manifest

def schema_gate(candidate,current):
 need(candidate['schemaSha256']==current['schemaSha256'] and candidate['migrations']==current['migrations'],'SCHEMA_CHANGE_REQUIRES_SEPARATE_APPROVED_MIGRATION')

def promote(host):
 """The same transaction is exercised in the real adapter and isolated failure lab.
 No DB rollback. All refusals before start_candidate leave active application untouched.
 """
 host.preflight()
 try:
  host.start_candidate();host.candidate_ready()
 except BaseException:
  host.stop_candidate();raise
 try:
  host.route_candidate()
  host.promote_services();host.official_ready();host.route_official();host.smoke()
  host.stop_candidate();host.commit()
 except BaseException as original:
  try:
   if host.restore_previous():host.previous_ready()
   host.recovery_complete()
  except BaseException as recovery:
   host.recovery_failed(original,recovery);raise
  raise
 finally:host.stop_candidate()
