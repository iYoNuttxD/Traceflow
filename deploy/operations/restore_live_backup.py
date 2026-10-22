#!/usr/bin/env python3
"""Offline-only restoration drill for a NEW clean-production backup.
No OCI access and no production credentials are used for the MySQL destination.
"""
import argparse,contextlib,datetime as dt,getpass,hashlib,importlib.util,json,os,re,resource
import signal,stat,subprocess,sys,tarfile,time,warnings,difflib,uuid
from pathlib import Path
BASE=Path(__file__).resolve().parent;REPO=BASE.parents[1]
sys.path.insert(0,str(BASE))
from live_operations import Refused,need,sha,canonical,dump_manifest,DUMP_FLAGS,validate_references,SERVER_UUID
from encrypted_workspace import EncryptedWorkspace
spec=importlib.util.spec_from_file_location('owned_restore_lab',REPO/'deploy/tests/persistence_lab.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);Lab=module.Lab
MYSQL=Path('/opt/homebrew/opt/mysql');NODE='/opt/homebrew/opt/node@22/bin/node'
AGE=Path.home()/'Library/Application Support/TraceFlowRecovery/tools/age-1.3.2/age'
KEYGEN=AGE.with_name('age-keygen')
AGE_HASH='4012dfc2725883beafb710894af4f599b7a94f8c8e0f51f02cc96ab8df33915e'
KEYGEN_HASH='c16e229245123d0ad27442317461d63915416cad0294395cd19ca93feb3211ea'
SECRET=re.compile(r'AGE-SECRET-KEY-1[023456789ACDEFGHJKLMNPQRSTUVWXYZ]{58}\Z')
ENV={'PATH':'/opt/homebrew/opt/openssl@3/bin:/usr/bin:/bin:/usr/sbin:/sbin','HOME':'/nonexistent','LANG':'C.UTF-8'}

def command(args,*,data=None,stdin=None,stdout=subprocess.PIPE,timeout=90,pass_fds=()):
 p=subprocess.run([str(a) for a in args],input=data,stdin=stdin if data is None else None,stdout=stdout,stderr=subprocess.PIPE,env=ENV,timeout=timeout,pass_fds=pass_fds)
 need(p.returncode==0,'OFFLINE_'+Path(args[0]).name.upper().replace('-','_')+'_FAILED');return p.stdout

def unpack(archive,dest,maximum):
 dest.mkdir(mode=0o700);total=0;seen=set()
 with tarfile.open(archive,'r:gz') as tar:
  for item in tar:
   parts=Path(item.name).parts
   need(item.isfile() and not item.name.startswith('/') and '..' not in parts and item.name not in seen,'UNSAFE_ARCHIVE_MEMBER')
   need(item.name in ('manifest.json','database.sql') or item.name.startswith(('storage/','configuration/')),'UNEXPECTED_ARCHIVE_MEMBER')
   total+=item.size;need(total<=maximum,'RESTORE_CAPACITY');seen.add(item.name)
   p=dest/item.name;p.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
   with tar.extractfile(item) as source,p.open('xb') as out:
    for b in iter(lambda:source.read(1024*1024),b''):out.write(b)
   p.chmod(0o600)
 need('manifest.json' in seen and 'database.sql' in seen,'ARCHIVE_INCOMPLETE')
 return json.loads((dest/'manifest.json').read_bytes())

def canonical_ddl(statement):
 # Only the proven redundant charset spelling, outside SQL literals/comments.
 quoted=r"'(?:''|\\.|[^'\\])*'|`(?:``|[^`])*`|\"(?:\"\"|\\.|[^\"\\])*\"|/\*.*?\*/"
 redundant=r"\bCHARACTER SET utf8mb4 (?=COLLATE utf8mb4_[A-Za-z0-9_]+\b)"
 return re.sub(quoted+'|'+redundant,lambda m:'' if m.group(0).startswith('CHARACTER SET utf8mb4 ') else m.group(0),statement,flags=re.S)

def compare_database(expected,actual,source_ddl,restored_ddl):
 if set(source_ddl)!=set(restored_ddl) or set(expected['tables'])!=set(actual['tables']):return False
 for name in expected['tables']:
  if name not in source_ddl or canonical_ddl(source_ddl[name])!=canonical_ddl(restored_ddl[name]):return False
  if {k:v for k,v in expected['tables'][name].items() if k!='structureSha256'}!={k:v for k,v in actual['tables'][name].items() if k!='structureSha256'}:return False
 return {k:v for k,v in expected.items() if k!='tables'}=={k:v for k,v in actual.items() if k!='tables'}

def snapshot_differences(expected,actual):
 result={}
 for name in sorted(set(expected['tables'])|set(actual['tables'])):
  a=expected['tables'].get(name);b=actual['tables'].get(name)
  if a!=b:result[name]={'source':a,'restored':b}
 extra={k:{'sourceSha256':hashlib.sha256(canonical(expected.get(k))).hexdigest(),'restoredSha256':hashlib.sha256(canonical(actual.get(k))).hexdigest()} for k in set(expected)|set(actual) if k!='tables' and expected.get(k)!=actual.get(k)}
 return {'tables':result,'otherComponents':extra}

def ddl_statements(path):
 result={};name=None;lines=[]
 with Path(path).open() as f:
  for line in f:
   match=re.match(r'^CREATE TABLE `([A-Za-z_][A-Za-z0-9_]*)` \(',line)
   if match:name=match[1];lines=[line];continue
   if name:
    lines.append(line)
    if line.rstrip().endswith(';'):result[name]=''.join(lines);name=None
 return result

def database_args(lab,role='migration',tool='mysql'):
 user,password=lab.credentials[role];option=lab.root/'private'/('restore-'+role+'.cnf')
 option.write_text('[client]\nuser='+user+'\npassword='+password+'\n');option.chmod(0o600)
 return [MYSQL/('bin/'+tool),'--defaults-file='+str(option),'--no-login-paths','--protocol=TCP','--host=127.0.0.1',
  '--port='+str(lab.port),'--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+str(lab.root/'ca.pem'),'--tls-version=TLSv1.2,TLSv1.3'],option

def run_restore(folder,run):
 folder=folder.resolve();need(folder.is_dir() and not folder.is_symlink() and folder.stat().st_uid==os.getuid() and not folder.stat().st_mode&0o077,'BACKUP_CUSTODY')
 receipt=json.loads((folder/'receipt.json').read_bytes());cfg=json.loads((folder/'config-public.json').read_bytes())
 cipher=folder/'payload.age';need(sha(cipher)==receipt['cipherSha256'] and cipher.stat().st_size==receipt['cipherBytes'],'CIPHER_HASH')
 need(receipt['status']=='SUCCESS' and receipt['externalReadback'] is True,'VERIFIED_EXTERNAL_COPY_REQUIRED')
 need(sha(AGE)==AGE_HASH and sha(KEYGEN)==KEYGEN_HASH,'LOCAL_CRYPTO_TOOL_INTEGRITY')
 version=command([MYSQL/'bin/mysqld','--no-defaults','--version']);need(b'26.7.0' in version,'LOCAL_MYSQL_VERSION')
 target=folder/'restore-result.json';need(not target.exists(),'RESTORE_RESULT_ALREADY_EXISTS')
 if not run:return {'status':'OFFLINE_RESTORE_PREFLIGHT_PASS','id':receipt['id'],'noProductionConnection':True,'keyRead':False}
 need(sys.stdin.isatty() and sys.stdout.isatty() and sys.stderr.isatty(),'PROTECTED_TTY_REQUIRED')
 resource.setrlimit(resource.RLIMIT_CORE,(0,0));os.umask(0o077)
 with warnings.catch_warnings():
  warnings.simplefilter('error',getpass.GetPassWarning)
  key=getpass.getpass('Chave de recuperação existente (entrada oculta): ').strip().encode()
 need(SECRET.fullmatch(key.decode()) is not None,'KEY_FORMAT')
 need(command([KEYGEN,'-y'],data=key+b'\n').decode().strip()==cfg['recipient'],'RECOVERY_KEY_MISMATCH')
 print('Restore somente em MySQL novo e descartável no Mac, em volume cifrado. Sem conexão à OCI.',flush=True)
 started=time.monotonic();lab=None;workspace=None
 os.environ['PATH']=ENV['PATH']
 try:
  with EncryptedWorkspace() as workspace, contextlib.ExitStack() as stack:
   archive=workspace.mount/'payload.tar.gz';fdread,fdwrite=os.pipe()
   try:
    os.write(fdwrite,key+b'\n');os.close(fdwrite);fdwrite=None;del key
    with archive.open('xb') as out:command([AGE,'--decrypt','--identity','/dev/fd/'+str(fdread),cipher],stdout=out,pass_fds=(fdread,))
   finally:
    os.close(fdread)
    if fdwrite is not None:os.close(fdwrite)
   need(sha(archive)==receipt['archiveSha256'],'DECRYPTED_ARCHIVE_HASH')
   root=workspace.mount/'recovered';manifest=unpack(archive,root,512*1024**2)
   need(sha(root/'manifest.json')==receipt['manifestSha256'] and manifest['id']==receipt['id'],'MANIFEST_BINDING')
   need(manifest['source'][0]==SERVER_UUID and manifest['source'][2]=='traceflow_live','SOURCE_IDENTITY')
   need(sha(root/'database.sql')==manifest['databaseSha256'],'DUMP_HASH')
   files={}
   for p in (root/'storage').rglob('*') if (root/'storage').exists() else []:
    if p.is_file():files[str(p.relative_to(root/'storage'))]={'sizeBytes':p.stat().st_size,'sha256':sha(p)}
   need(files==manifest['files'],'PERSISTENT_FILES_HASH');validate_references(manifest['snapshot'],files)
   for name,h in manifest['configurationSha256'].items():need(sha(root/'configuration'/name)==h,'CONFIGURATION_HASH')
   # The dump must not choose a database, create users, load files, or grant rights.
   with (root/'database.sql').open() as dump:
    for line in dump:
     need(not re.match(r'^(?:USE |CREATE DATABASE|DROP DATABASE|CREATE USER|ALTER USER|GRANT |REVOKE |LOAD DATA|SELECT .*INTO OUTFILE)',line,re.I),'DUMP_GLOBAL_OPERATION')
   lab=Lab(workspace.mount,str(MYSQL),'26.7.0',REPO,NODE,None)
   stack.callback(lab.stop)
   lab.env['PATH']=ENV['PATH'];lab.start()
   need(lab.port>=49152 and lab.uuid!=SERVER_UUID and lab.schema.startswith('tf_oci_') and lab.root.is_relative_to(workspace.mount),'ISOLATED_TARGET_IDENTITY')
   need(lab.sql('migration','SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()').strip()==b'0','RESTORE_TARGET_NOT_EMPTY')
   args,option=database_args(lab)
   try:
    with (root/'database.sql').open('rb') as source:command(args+['--binary-mode','--local-infile=0',lab.schema],stdin=source,timeout=300)
   finally:option.unlink()
   args,option=database_args(lab,'backup','mysqldump');restored=workspace.mount/'restored.sql'
   try:
    with restored.open('xb') as out:command(args+DUMP_FLAGS+[lab.schema],stdout=out,timeout=180)
   finally:option.unlink()
   actual=dump_manifest(restored)
   sourceDDL=ddl_statements(root/'database.sql');actualDDL=ddl_statements(restored)
   need(dump_manifest(root/'database.sql')==manifest['snapshot'],'ORIGINAL_SNAPSHOT_BINDING')
   if not compare_database(manifest['snapshot'],actual,sourceDDL,actualDDL):
    differences=snapshot_differences(manifest['snapshot'],actual)
    sourceDDL=ddl_statements(root/'database.sql');actualDDL=ddl_statements(restored)
    for name,value in differences['tables'].items():
     if value['source'] and value['restored'] and value['source']['structureSha256']!=value['restored']['structureSha256']:
      # DDL only; never emit INSERT statements or business values. Mask SQL literals.
      lines=list(difflib.unified_diff(sourceDDL.get(name,'').splitlines(),actualDDL.get(name,'').splitlines(),n=1))
      value['ddlDifferenceRedacted']=[re.sub(r"'(?:[^'\\]|\\.)*'","'<literal>'",line)[:500] for line in lines[:50]]
    diagnostic={'status':'RESTORE_DIAGNOSTIC','id':receipt['id'],'differences':differences,'dataValuesIncluded':False}
    with (folder/('restore-diagnostic-'+uuid.uuid4().hex+'.json')).open('xb') as f:f.write(canonical(diagnostic))
    raise Refused('RESTORED_DATABASE_MISMATCH')
   # All FK groups, not just a count; no business data is emitted.
   rows=lab.sql('migration',"SELECT JSON_ARRAY(TABLE_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION),GROUP_CONCAT(REFERENCED_COLUMN_NAME ORDER BY ORDINAL_POSITION)) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL GROUP BY TABLE_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME").decode().splitlines()
   for line in rows:
    table,constraint,ref,cols,refs=json.loads(line);cs=cols.split(',');rs=refs.split(',')
    need(all(re.fullmatch('[A-Za-z_][A-Za-z0-9_]*',x) for x in [table,ref,*cs,*rs]),'FK_IDENTIFIER')
    condition=' AND '.join('c.`'+x+'` IS NOT NULL' for x in cs);join=' AND '.join('c.`'+x+'`=p.`'+y+'`' for x,y in zip(cs,rs))
    need(lab.sql('migration','SELECT COUNT(*) FROM `'+table+'` c WHERE '+condition+' AND NOT EXISTS (SELECT 1 FROM `'+ref+'` p WHERE '+join+')').strip()==b'0','RESTORED_FOREIGN_KEY_ORPHAN')
   expected=manifest['snapshot']
   need(len(rows)==sum(v['foreignKeys'] for v in expected['tables'].values()) and len(actual['migrations'])==len(expected['migrations']) and set(actual['tables'])==set(expected['tables']),'RESTORED_COUNTS')
   result={'status':'ISOLATED_RESTORE_PASS','id':receipt['id'],'cipherSha256':receipt['cipherSha256'],'manifestSha256':receipt['manifestSha256'],
    'tables':len(actual['tables']),'migrations':len(actual['migrations']),'foreignKeysChecked':len(rows),'allTableDataHashesEqual':True,'allStructuresEqual':True,
    'rawDdlHashesEqual':all(actual['tables'][n]['structureSha256']==manifest['snapshot']['tables'][n]['structureSha256'] for n in actual['tables']),'structureComparison':'exact-ddl-except-proven-redundant-utf8mb4-charset','persistentFiles':len(files),'persistentFileHashesEqual':True,'configurationHashesEqual':True,'sourceMysql':manifest['source'][1],
    'isolatedMysql':'26.7.0','isolatedServerUuid':lab.uuid,'isolatedPort':lab.port,'productionDestination':False,'encryptedWorkspace':True}
 finally:
  if lab:lab.stop()
 # EncryptedWorkspace may not detach while MySQL is running: stop it inside scope below.
 need(workspace is not None and not workspace.base.exists(),'RESTORE_CLEANUP')
 result.update(cleanup=True,finishedAt=dt.datetime.now(dt.timezone.utc).isoformat(),seconds=round(time.monotonic()-started,3))
 with target.open('xb') as f:f.write(canonical(result))
 return result

def main():
 p=argparse.ArgumentParser(description=__doc__);g=p.add_mutually_exclusive_group(required=True);g.add_argument('--run',action='store_true');g.add_argument('--check',action='store_true');p.add_argument('folder',type=Path);a=p.parse_args()
 print(json.dumps(run_restore(a.folder,a.run),indent=2))
if __name__=='__main__':
 try:main()
 except BaseException as e:
  if isinstance(e,SystemExit):raise
  print(json.dumps({'status':'BLOCKED','code':str(e) if isinstance(e,Refused) else type(e).__name__,'secretsPrinted':False}));sys.exit(1)
