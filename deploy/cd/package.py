#!/usr/bin/env python3
"""Deterministic clean-install package; never imports legacy deployment code."""
import argparse,gzip,hashlib,json,os,platform,re,stat,subprocess,tarfile
from pathlib import Path
BASELINE='9bc3dad199566afc6fa43d67abba400665d843ea'
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def canonical(v):return (json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
def need(v,c):
 if not v:raise ValueError(c)
def inventory(root):
 result={}
 for p in sorted(root.rglob('*')):
  name=p.relative_to(root).as_posix();s=p.lstat()
  if stat.S_ISDIR(s.st_mode):continue
  if p.is_symlink():
   target=os.readlink(p);need(not target.startswith('/') and p.resolve().is_relative_to(root.resolve()),'UNSAFE_LINK')
   result[name]={'link':target}
  else:
   need(stat.S_ISREG(s.st_mode) and s.st_nlink==1,'UNSAFE_FILE');need(p.name not in ('.env','.npmrc') and not p.name.startswith('.env.'),'SECRET_FILE')
   result[name]={'bytes':s.st_size,'sha256':sha(p),'mode':0o755 if s.st_mode&0o111 else 0o644}
 return result
def pack(root,out,commit,epoch,source_root=None):
 need(re.fullmatch('[a-f0-9]{40}',commit),'FULL_COMMIT_REQUIRED')
 source_root=Path.cwd() if source_root is None else Path(source_root)
 need(subprocess.check_output(['git','rev-parse','HEAD'],cwd=source_root,text=True).strip()==commit,'SOURCE_COMMIT')
 subprocess.run(['git','diff','--exit-code'],cwd=source_root,check=True,stdout=subprocess.PIPE)
 locks={p:hashlib.sha256(subprocess.check_output(['git','show',commit+':'+p],cwd=source_root)).hexdigest() for p in ['backend/package-lock.json','frontend/package-lock.json']}
 files=inventory(root);need('backend/src/server.js' in files and 'frontend/index.html' in files,'PACKAGE_INCOMPLETE')
 migrations=[{'name':p.parent.name,'sha256':sha(p)} for p in sorted((root/'backend/prisma/migrations').glob('*/migration.sql'))]
 manifest={'formatVersion':1,'kind':'traceflow-clean-cd','commit':commit,'sourceState':'committed','sourceLockfiles':locks,'npm':subprocess.check_output(['npm','--version'],text=True).strip(),'node':subprocess.check_output(['node','--version'],text=True).strip(),'prisma':json.loads((root/'backend/node_modules/@prisma/client/package.json').read_text())['version'],'arch':platform.machine(),'os':Path('/etc/oracle-release').read_text().strip() if Path('/etc/oracle-release').exists() else 'test-only','schemaSha256':sha(root/'backend/prisma/schema.prisma'),'migrations':migrations,'files':files}
 (root/'cd-manifest.json').write_bytes(canonical(manifest));out.parent.mkdir(parents=True,exist_ok=True)
 with out.open('wb') as raw,gzip.GzipFile(filename='',fileobj=raw,mode='wb',mtime=0) as gz,tarfile.open(fileobj=gz,mode='w|',format=tarfile.PAX_FORMAT) as tar:
  for p in sorted(root.rglob('*')):
   if p.is_dir() and not p.is_symlink():continue
   t=tar.gettarinfo(str(p),arcname=p.relative_to(root).as_posix());t.uid=t.gid=0;t.uname=t.gname='';t.mtime=epoch;t.pax_headers={};t.mode=0o777 if p.is_symlink() else (0o755 if p.stat().st_mode&0o111 else 0o644)
   if p.is_symlink():tar.addfile(t)
   else:
    with p.open('rb') as f:tar.addfile(t,f)
 return {'commit':commit,'packageSha256':sha(out),'manifestSha256':sha(root/'cd-manifest.json'),'files':len(files),'migrations':len(migrations)}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('out',type=Path);p.add_argument('--commit',required=True);p.add_argument('--epoch',required=True,type=int);a=p.parse_args();print(json.dumps(pack(a.root,a.out,a.commit,a.epoch)))
