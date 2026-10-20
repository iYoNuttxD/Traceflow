"""Read-only snapshot/anti-orphan checks proven in OCI07.9; no restore operation."""
import contextlib, hashlib, os, pwd, re, stat, tarfile
from pathlib import Path
from operational_io import secure_read, secure_stream, require, digest, encoded, private_write
from recovery_policy import MAX_SET
# Explicit plaintext budgets leave room for tar framing and age overhead within
# the unchanged 512 MiB encrypted-object policy. 200 MiB now + 100 MiB next upload.
MAX_STORAGE_BYTES=320*1024**2
MAX_STORAGE_FILE_BYTES=128*1024**2
MAX_STORAGE_FILES=4096
MAX_DATABASE_BYTES=160*1024**2
MAX_SNAPSHOT_BYTES=8*1024**2
MAX_MANIFEST_BYTES=8*1024**2
MAX_ARCHIVE_BYTES=MAX_SET-1024**2
STREAM_CHUNK_BYTES=1024**2
STORAGE=Path('/var/lib/traceflow/test-evidence')
UUID_PATTERN=r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
TABLE=re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,63}$')

def schema_name(value):
    require(isinstance(value,str) and TABLE.fullmatch(value), 'INVALID_IDENTIFIER')
    return '`'+value+'`'

def validate_files(snapshot, files):
    for row in snapshot['evidence']:
        key=row['storageKey']
        require(re.fullmatch(UUID_PATTERN,key) and files.get(key)=={'sha256':row['sha256'],'size':row['sizeBytes']}, 'EVIDENCE_MISSING_OR_CORRUPT')
    for row in snapshot['uploads']:
        require(re.fullmatch(UUID_PATTERN,row['id']), 'UPLOAD_ID_INVALID')
        if row['status'] not in ('OPEN','FINALIZING'): continue
        for f in row['filesJson']:
            for part in f['parts'].values():
                key='.uploads/'+row['id']+'/'+part['key']
                require(files.get(key)=={'sha256':part['sha256'],'size':part['sizeBytes']}, 'UPLOAD_PART_MISSING_OR_CORRUPT')

def snapshot_impl(self):
        self.identity()
        tables=self.rows("SELECT JSON_OBJECT('name',TABLE_NAME,'engine',ENGINE,'collation',TABLE_COLLATION,'type',TABLE_TYPE) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY CAST(TABLE_NAME AS BINARY)")
        require(tables and all(t['engine']=='InnoDB' and t['type']=='BASE TABLE' for t in tables),'UNSUPPORTED_DATABASE_OBJECT')
        for table, column in [('TRIGGERS','TRIGGER_SCHEMA'),('ROUTINES','ROUTINE_SCHEMA'),('EVENTS','EVENT_SCHEMA')]:
            require(self.query('SELECT COUNT(*) FROM INFORMATION_SCHEMA.'+table+' WHERE '+column+'=DATABASE()')==['0'],'UNSUPPORTED_DATABASE_OBJECT')
        ledger=self.rows("SELECT JSON_OBJECT('name',migration_name,'sha256',checksum,'finished',finished_at IS NOT NULL,'rolledBack',rolled_back_at IS NOT NULL) FROM _prisma_migrations ORDER BY CAST(migration_name AS BINARY)")
        require([{'name':x['name'],'sha256':x['sha256']} for x in ledger]==self.schema_contract['migrations'] and
                all(x['finished'] and not x['rolledBack'] for x in ledger),'MIGRATION_CHAIN_MISMATCH')
        structures={}; data={}
        for table in tables:
            name=table['name']; ident=schema_name(name)
            cols=self.rows("SELECT JSON_OBJECT('name',COLUMN_NAME,'type',COLUMN_TYPE,'nullable',IS_NULLABLE,'default',COLUMN_DEFAULT,'extra',EXTRA,'collation',COLLATION_NAME,'charset',CHARACTER_SET_NAME,'generation',GENERATION_EXPRESSION) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='"+name+"' ORDER BY ORDINAL_POSITION")
            indexes=self.query('SHOW INDEX FROM '+ident)
            # SHOW CREATE is stable on the exact server version; AUTO_INCREMENT represents data, not structure.
            ddl=self.query('SHOW CREATE TABLE '+ident)
            structures[name]={'columns':cols,'ddl':re.sub(r' CHARACTER SET [a-zA-Z0-9_]+','',re.sub(r'AUTO_INCREMENT=\d+','AUTO_INCREMENT=<counter>','\n'.join(ddl))),
                              'indexes':[line.split('\t')[:6] for line in indexes]}
            expressions=','.join(schema_name(c['name']) for c in cols)
            rows=sorted(self.query('SELECT JSON_ARRAY('+expressions+') FROM '+ident))
            data[name]={'count':len(rows),'sha256':digest(encoded(rows))}
        evidence=self.rows("SELECT JSON_OBJECT('storageKey',storageKey,'sha256',sha256,'sizeBytes',sizeBytes) FROM TestEvidence ORDER BY storageKey")
        uploads=self.rows("SELECT JSON_OBJECT('id',id,'status',status,'filesJson',filesJson,'leaseUntil',leaseUntil,'expiresAt',expiresAt) FROM EvidenceUpload ORDER BY id")
        # Explicit anti-joins catch referential damage even when FOREIGN_KEY_CHECKS was disabled on import.
        fks=self.rows("SELECT JSON_OBJECT('table',TABLE_NAME,'constraint',CONSTRAINT_NAME,'column',COLUMN_NAME,'refTable',REFERENCED_TABLE_NAME,'refColumn',REFERENCED_COLUMN_NAME) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION")
        groups={}
        for fk in fks: groups.setdefault((fk['table'],fk['constraint'],fk['refTable']),[]).append(fk)
        for (table,_,ref), keys in groups.items():
            present=' AND '.join('c.'+schema_name(k['column'])+' IS NOT NULL' for k in keys)
            relation=' AND '.join('c.'+schema_name(k['column'])+'=p.'+schema_name(k['refColumn']) for k in keys)
            sql='SELECT COUNT(*) FROM '+schema_name(table)+' c WHERE '+present+' AND NOT EXISTS (SELECT 1 FROM '+schema_name(ref)+' p WHERE '+relation+')'
            require(self.query(sql)==['0'],'FOREIGN_KEY_ORPHAN')
        return {'tables':tables,'structures':structures,'data':data,'evidence':evidence,'uploads':uploads,'foreignKeys':len(groups)}

def storage_copy(destination):
 uid=pwd.getpwnam('traceflow').pw_uid
 require(STORAGE.stat().st_uid==uid and STORAGE.stat().st_mode&0o777==0o700 and not STORAGE.is_symlink(),'STORAGE_OWNER')
 files={};total=0
 for p in sorted(STORAGE.rglob('*')):
  name=p.relative_to(STORAGE).as_posix();s=p.lstat()
  require(not p.is_symlink() and s.st_uid==uid and not s.st_mode&0o077,'STORAGE_CUSTODY')
  if stat.S_ISDIR(s.st_mode):
   require(name=='.uploads' or re.fullmatch(r'\.uploads/'+UUID_PATTERN+r'(?:/work-'+UUID_PATTERN+r')?',name),'STORAGE_DIRECTORY');continue
  require(stat.S_ISREG(s.st_mode) and re.fullmatch(UUID_PATTERN+r'|\.uploads/'+UUID_PATTERN+r'/(?:part-'+UUID_PATTERN+r'|work-'+UUID_PATTERN+r'/'+UUID_PATTERN+r')',name),'STORAGE_FILE')
  total+=s.st_size
  require(len(files)<MAX_STORAGE_FILES and total<=MAX_STORAGE_BYTES and s.st_size<=MAX_STORAGE_FILE_BYTES,'STORAGE_SIZE_REQUIRES_REVIEW')
  target=None
  if destination is not None:
   target=Path(destination)/name;target.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
  writer=(os.fdopen(os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb')
          if target is not None else contextlib.nullcontext())
  h=hashlib.sha256();size=0
  with writer as output,secure_stream(p,uid,MAX_STORAGE_FILE_BYTES,0o600) as incoming:
   while True:
    chunk=incoming.read(STREAM_CHUNK_BYTES)
    if not chunk:break
    size+=len(chunk);require(size<=s.st_size,'SOURCE_CHANGED');h.update(chunk)
    if output is not None:output.write(chunk)
   require(size==s.st_size,'SOURCE_CHANGED')
   if output is not None:output.flush();os.fsync(output.fileno())
  files[name]={'sha256':h.hexdigest(),'size':size}
 return files


def pack_archive(scratch,archive,inventory,check=lambda:None):
 """Stream the exact captured inventory into deterministic USTAR entries."""
 from recovery_archive import allowed
 require(len(inventory)<=MAX_STORAGE_FILES+7 and all(allowed(n) for n in inventory),'ARCHIVE_MEMBER')
 total=sum(v['size'] for v in inventory.values())
 framed=sum(512+((v['size']+511)//512)*512 for v in inventory.values())+1024
 framed=((framed+10239)//10240)*10240
 require(total<=MAX_ARCHIVE_BYTES and framed<=MAX_ARCHIVE_BYTES,'BACKUP_SIZE_REVIEW')
 class Reader:
  def __init__(self,stream):self.stream=stream;self.hash=hashlib.sha256();self.size=0
  def read(self,n):
   check();require(0<=n<=STREAM_CHUNK_BYTES,'ARCHIVE_READ_LIMIT')
   block=self.stream.read(n);self.hash.update(block);self.size+=len(block);return block
 with tarfile.open(archive,'x',format=tarfile.USTAR_FORMAT) as tar:
  os.chmod(archive,0o600)
  for name,expected in sorted(inventory.items()):
   check()
   with secure_stream(Path(scratch)/name,0,MAX_ARCHIVE_BYTES,0o600) as incoming:
    require(os.fstat(incoming.fileno()).st_size==expected['size'],'ARCHIVE_SOURCE_CHANGED')
    member=tarfile.TarInfo(name);member.size=expected['size'];member.mode=0o600
    reader=Reader(incoming);tar.addfile(member,reader)
    require(reader.size==expected['size'] and reader.hash.hexdigest()==expected['sha256'],'ARCHIVE_SOURCE_CHANGED')
 require(Path(archive).stat().st_size==framed,'ARCHIVE_SIZE_CHANGED')
 with Path(archive).open('rb') as stream:os.fsync(stream.fileno())
