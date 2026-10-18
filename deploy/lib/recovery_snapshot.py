"""Read-only snapshot/anti-orphan checks proven in OCI07.9; no restore operation."""
import os, pwd, re, stat
from pathlib import Path
from operational_io import secure_read, require, digest, encoded, private_write
MAX=512*1024**2
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
  total+=s.st_size;require(total<=MAX//4,'STORAGE_SIZE_REQUIRES_REVIEW')
  data=secure_read(p,uid,MAX//4,0o600);files[name]={'sha256':digest(data),'size':len(data)}
  if destination is not None:
   target=destination/name;target.parent.mkdir(parents=True,mode=0o700,exist_ok=True);private_write(target,data)
 return files
