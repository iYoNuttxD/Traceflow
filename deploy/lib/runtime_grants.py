"""Fixed, complete 15-source runtime grant audit from OCI07.8. No generic grants."""
import hashlib, json, re
from release_contract import Refused
AuditRefused = Refused

def audit_check(ok,code):
 if not ok:raise AuditRefused(code)

def unique_json(value):
 def unique(pairs):
  result={}
  for k,v in pairs:
   audit_check(k not in result,'DUPLICATE_JSON');result[k]=v
  return result
 return json.loads(value,object_pairs_hook=unique,parse_constant=lambda _:audit_check(False,'JSON_NUMBER'))

def plan_for(model,user):
 audit_check(user in ('traceflow_api','traceflow_worker'),'AUDIT_ACCOUNT')
 return [{**q,'sql':q['sql'].replace("'traceflow_diag'","'"+user+"'")} for q in model['plan']]

def sql_frames(plan):
 return '\n'.join("SELECT 'TF_W02_"+q['id']+"_BEGIN', CONNECTION_ID();\n"+q['sql']+";\nSHOW COUNT(*) WARNINGS;\nSELECT 'TF_W02_"+q['id']+"_END', CONNECTION_ID();" for q in plan)+'\n'

def parse_frames(text,plan):
 audit_check(isinstance(text,str) and len(text.encode())<=65536 and text.endswith('\n') and '\r' not in text,'ADMIN_OUTPUT_INVALID')
 lines=text[:-1].split('\n');pos=0;cid=None;result={}
 for q in plan:
  audit_check(pos<len(lines),'ADMIN_TRUNCATED');start=lines[pos].split('\t');pos+=1
  audit_check(len(start)==2 and start[0]=='TF_W02_'+q['id']+'_BEGIN' and re.fullmatch('[1-9][0-9]{0,19}',start[1]),'ADMIN_FRAME')
  cid=cid or start[1];audit_check(start[1]==cid,'ADMIN_SESSION_CHANGED');payload=[]
  while pos<len(lines) and not lines[pos].startswith('TF_W02_'+q['id']+'_END\t'):
   payload.append(lines[pos]);pos+=1
  audit_check(pos<len(lines) and lines[pos]=='TF_W02_'+q['id']+'_END\t'+cid,'ADMIN_FRAME');pos+=1
  audit_check(payload and payload.pop()=='0','ADMIN_WARNINGS');audit_check(len(payload)<=512,'ADMIN_OUTPUT_LIMIT')
  rows=[[x] if q['id']=='GRANTS' else x.split('\t') if q['id']=='SESSION_TLS' else unique_json(x) for x in payload]
  audit_check(all(isinstance(x,list) and len(x)==q['width'] and all(v is None or isinstance(v,str) or type(v) is int for v in x) for x in rows),'ADMIN_ROWS')
  result[q['id']]=rows
 audit_check(pos==len(lines),'ADMIN_TRAILING_OUTPUT')
 return result,cid

def validate_audit(rows,cid,model,user,locked=True):
 audit_check(set(rows)=={q['id'] for q in model['plan']},'ADMIN_SOURCES')
 expect=['6e94bb7f-c601-11f1-9b91-02001704771f','26.7.0-cloud',3306,'traceflow_admin@%',int(cid),'public',0,1,1,1]
 audit_check(rows['IDENTITY_START']==rows['IDENTITY_END']==[expect],'ADMIN_IDENTITY')
 tls=rows['SESSION_TLS'];audit_check(len(tls)==2 and len({x[0] for x in tls})==2,'ADMIN_TLS')
 tv=dict(tls);audit_check(set(tv)=={'Ssl_cipher','Ssl_version'} and tv['Ssl_cipher'] and tv['Ssl_version'] in ('TLSv1.2','TLSv1.3'),'ADMIN_TLS')
 columns=sorted([[t,c] for t,cols in model['columns'].items() for c in cols])
 audit_check(sorted(rows['MODEL'])==columns,'ADMIN_MODEL_UNRECOGNIZED')
 audit_check(rows['PUBLIC']==[],'ROLE_PRESENT_UNVERIFIED')
 u=['10.20.1.184',user]+['N']*len(model['global'])+['ANY','Y' if locked else 'N',None]
 audit_check(rows['USER']==[u],'ADMIN_ACCOUNT_GLOBAL_TLS_LOCK_OR_REVOKE')
 s=['10.20.1.184','traceflow',user]+['Y' if x in ('Select_priv','Insert_priv','Update_priv','Delete_priv') else 'N' for x in model['schema']]
 audit_check(rows['SCHEMA']==[s],'ADMIN_SCHEMA_PRIVILEGES')
 for source in ('DYNAMIC','TABLE','COLUMN','ROUTINE','EDGES','DEFAULTS','PROXY'):
  audit_check(rows[source]==[],'ADMIN_UNEXPECTED_'+source)
 grants=sorted(['GRANT USAGE ON *.* TO `'+user+'`@`10.20.1.184`','GRANT SELECT, INSERT, UPDATE, DELETE ON `traceflow`.* TO `'+user+'`@`10.20.1.184`'])
 audit_check(sorted(x[0] for x in rows['GRANTS'])==grants,'ADMIN_GRANTS')
 state={k:v for k,v in rows.items() if k not in ('IDENTITY_START','IDENTITY_END','SESSION_TLS')}
 return {'account':user+'@10.20.1.184','tls':tv['Ssl_version'],'privileges':'USAGE_GLOBAL_AND_SCHEMA_CRUD_ONLY','roleState':'ABSENT','accountLocked':locked,'sourceCount':15,'warnings':0,'stateSha256':hashlib.sha256(json.dumps(state,sort_keys=True,separators=(',',':')).encode()).hexdigest()}

MODEL = {'plan': [{'id': 'IDENTITY_START', 'sql': 'SELECT JSON_ARRAY(@@server_uuid, VERSION(), @@port, CURRENT_USER(), CONNECTION_ID(), @@GLOBAL.mandatory_roles, @@GLOBAL.activate_all_roles_on_login, @@GLOBAL.partial_revokes, @@SESSION.sql_notes, @@GLOBAL.require_secure_transport)', 'width': 10}, {'id': 'SESSION_TLS', 'sql': "SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher','Ssl_version')", 'width': 2}, {'id': 'MODEL', 'sql': "SELECT JSON_ARRAY(TABLE_NAME, COLUMN_NAME) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'mysql' AND TABLE_NAME IN ('user', 'global_grants', 'db', 'tables_priv', 'columns_priv', 'procs_priv', 'role_edges', 'default_roles', 'proxies_priv') ORDER BY TABLE_NAME, ORDINAL_POSITION", 'width': 2}, {'id': 'PUBLIC', 'sql': "SELECT JSON_ARRAY(User, Host) FROM mysql.user WHERE User = 'public'", 'width': 2}, {'id': 'USER', 'sql': "SELECT JSON_ARRAY(`Host`, `User`, `Select_priv`, `Insert_priv`, `Update_priv`, `Delete_priv`, `Create_priv`, `Drop_priv`, `Grant_priv`, `References_priv`, `Index_priv`, `Alter_priv`, `Create_tmp_table_priv`, `Lock_tables_priv`, `Create_view_priv`, `Show_view_priv`, `Create_routine_priv`, `Alter_routine_priv`, `Execute_priv`, `Event_priv`, `Trigger_priv`, `Reload_priv`, `Shutdown_priv`, `Process_priv`, `File_priv`, `Show_db_priv`, `Super_priv`, `Repl_slave_priv`, `Repl_client_priv`, `Create_user_priv`, `Create_tablespace_priv`, `Create_role_priv`, `Drop_role_priv`, `ssl_type`, `account_locked`, JSON_EXTRACT(User_attributes, '$.Restrictions')) FROM mysql.user WHERE User = 'traceflow_diag'", 'width': 36}, {'id': 'DYNAMIC', 'sql': "SELECT JSON_ARRAY(`USER`, `HOST`, `PRIV`, `WITH_GRANT_OPTION`) FROM mysql.`global_grants` WHERE User = 'traceflow_diag'", 'width': 4}, {'id': 'SCHEMA', 'sql': "SELECT JSON_ARRAY(`Host`, `Db`, `User`, `Select_priv`, `Insert_priv`, `Update_priv`, `Delete_priv`, `Create_priv`, `Drop_priv`, `Grant_priv`, `References_priv`, `Index_priv`, `Alter_priv`, `Create_tmp_table_priv`, `Lock_tables_priv`, `Create_view_priv`, `Show_view_priv`, `Create_routine_priv`, `Alter_routine_priv`, `Execute_priv`, `Event_priv`, `Trigger_priv`) FROM mysql.`db` WHERE User = 'traceflow_diag'", 'width': 22}, {'id': 'TABLE', 'sql': "SELECT JSON_ARRAY(`Host`, `Db`, `User`, `Table_name`, `Table_priv`, `Column_priv`) FROM mysql.`tables_priv` WHERE User = 'traceflow_diag'", 'width': 6}, {'id': 'COLUMN', 'sql': "SELECT JSON_ARRAY(`Host`, `Db`, `User`, `Table_name`, `Column_name`, `Column_priv`) FROM mysql.`columns_priv` WHERE User = 'traceflow_diag'", 'width': 6}, {'id': 'ROUTINE', 'sql': "SELECT JSON_ARRAY(`Host`, `Db`, `User`, `Routine_name`, `Routine_type`, `Proc_priv`) FROM mysql.`procs_priv` WHERE User = 'traceflow_diag'", 'width': 6}, {'id': 'EDGES', 'sql': "SELECT JSON_ARRAY(`FROM_HOST`, `FROM_USER`, `TO_HOST`, `TO_USER`, `WITH_ADMIN_OPTION`) FROM mysql.`role_edges` WHERE FROM_USER IN ('traceflow_diag','public') OR TO_USER IN ('traceflow_diag','public')", 'width': 5}, {'id': 'DEFAULTS', 'sql': "SELECT JSON_ARRAY(`HOST`, `USER`, `DEFAULT_ROLE_HOST`, `DEFAULT_ROLE_USER`) FROM mysql.`default_roles` WHERE USER IN ('traceflow_diag','public') OR DEFAULT_ROLE_USER IN ('traceflow_diag','public')", 'width': 4}, {'id': 'PROXY', 'sql': "SELECT JSON_ARRAY(`Host`, `User`, `Proxied_host`, `Proxied_user`, `With_grant`) FROM mysql.`proxies_priv` WHERE User = 'traceflow_diag'", 'width': 5}, {'id': 'GRANTS', 'sql': "SHOW GRANTS FOR 'traceflow_diag'@'10.20.1.184'", 'width': 1}, {'id': 'IDENTITY_END', 'sql': 'SELECT JSON_ARRAY(@@server_uuid, VERSION(), @@port, CURRENT_USER(), CONNECTION_ID(), @@GLOBAL.mandatory_roles, @@GLOBAL.activate_all_roles_on_login, @@GLOBAL.partial_revokes, @@SESSION.sql_notes, @@GLOBAL.require_secure_transport)', 'width': 10}], 'columns': {'user': ['Host', 'User', 'Select_priv', 'Insert_priv', 'Update_priv', 'Delete_priv', 'Create_priv', 'Drop_priv', 'Grant_priv', 'References_priv', 'Index_priv', 'Alter_priv', 'Create_tmp_table_priv', 'Lock_tables_priv', 'Create_view_priv', 'Show_view_priv', 'Create_routine_priv', 'Alter_routine_priv', 'Execute_priv', 'Event_priv', 'Trigger_priv', 'Reload_priv', 'Shutdown_priv', 'Process_priv', 'File_priv', 'Show_db_priv', 'Super_priv', 'Repl_slave_priv', 'Repl_client_priv', 'Create_user_priv', 'Create_tablespace_priv', 'Create_role_priv', 'Drop_role_priv', 'ssl_type', 'ssl_cipher', 'x509_issuer', 'x509_subject', 'max_questions', 'max_updates', 'max_connections', 'max_user_connections', 'plugin', 'authentication_string', 'password_expired', 'password_last_changed', 'password_lifetime', 'account_locked', 'Password_reuse_history', 'Password_reuse_time', 'Password_require_current', 'User_attributes'], 'global_grants': ['USER', 'HOST', 'PRIV', 'WITH_GRANT_OPTION'], 'db': ['Host', 'Db', 'User', 'Select_priv', 'Insert_priv', 'Update_priv', 'Delete_priv', 'Create_priv', 'Drop_priv', 'Grant_priv', 'References_priv', 'Index_priv', 'Alter_priv', 'Create_tmp_table_priv', 'Lock_tables_priv', 'Create_view_priv', 'Show_view_priv', 'Create_routine_priv', 'Alter_routine_priv', 'Execute_priv', 'Event_priv', 'Trigger_priv'], 'tables_priv': ['Host', 'Db', 'User', 'Table_name', 'Grantor', 'Timestamp', 'Table_priv', 'Column_priv'], 'columns_priv': ['Host', 'Db', 'User', 'Table_name', 'Column_name', 'Timestamp', 'Column_priv'], 'procs_priv': ['Host', 'Db', 'User', 'Routine_name', 'Routine_type', 'Grantor', 'Proc_priv', 'Timestamp'], 'role_edges': ['FROM_HOST', 'FROM_USER', 'TO_HOST', 'TO_USER', 'WITH_ADMIN_OPTION'], 'default_roles': ['HOST', 'USER', 'DEFAULT_ROLE_HOST', 'DEFAULT_ROLE_USER'], 'proxies_priv': ['Host', 'User', 'Proxied_host', 'Proxied_user', 'With_grant', 'Grantor', 'Timestamp']}, 'global': ['Select_priv', 'Insert_priv', 'Update_priv', 'Delete_priv', 'Create_priv', 'Drop_priv', 'Grant_priv', 'References_priv', 'Index_priv', 'Alter_priv', 'Create_tmp_table_priv', 'Lock_tables_priv', 'Create_view_priv', 'Show_view_priv', 'Create_routine_priv', 'Alter_routine_priv', 'Execute_priv', 'Event_priv', 'Trigger_priv', 'Reload_priv', 'Shutdown_priv', 'Process_priv', 'File_priv', 'Show_db_priv', 'Super_priv', 'Repl_slave_priv', 'Repl_client_priv', 'Create_user_priv', 'Create_tablespace_priv', 'Create_role_priv', 'Drop_role_priv'], 'schema': ['Select_priv', 'Insert_priv', 'Update_priv', 'Delete_priv', 'Create_priv', 'Drop_priv', 'Grant_priv', 'References_priv', 'Index_priv', 'Alter_priv', 'Create_tmp_table_priv', 'Lock_tables_priv', 'Create_view_priv', 'Show_view_priv', 'Create_routine_priv', 'Alter_routine_priv', 'Execute_priv', 'Event_priv', 'Trigger_priv']}
