"""Fail-closed preservation for one reviewed transition. Raw rows stay in memory."""
import datetime as dt
import hashlib
import json
import re
from contract import canonical, need, sha

POLICY = 'standalone-lifecycle-84-86-v1'
SOURCE_SCHEMA = '2b38a8124ff16c39f1f0def026e920577f3744424af7cd3a31c6158d594396a6'
TARGET_SCHEMA = '5d872e68da1759a2a64caf4c25d8a13308315c8f2c49ef400fca2f5e1948180a'
SOURCE_CHAIN = 'd4961d745a267e3c5ef5a5a7a6d346e727c20a3e2a116ac1c86d3b3ba16a9bda'
TARGET_CHAIN = 'e665b50a1eedc543eb2a67b6c276f792980bc65d9032d34af560e181f9d90e88'
MIGRATIONS = {
 '20261013170000_manual_test_execution_reference': '46c9e78df830d6138c70d041dfb1ff60269af2aa08849ed2e9253474fdb1d2a7',
 '20261013171000_requirement_lifecycle_basis': '4b442367cae65529bf5f96b7ca33735155f6cc0add9158bf4d7e050457f4e758',
}
TABLES = ('Requirement', 'RequirementTraceabilityState', 'RequirementTraceabilityHistoryEntry')
MAX_ROW_BYTES = 8 * 1024 * 1024
MAX_ROWS = 50000

class Snapshot(dict):
 """JSON serialization exposes only the inherited counts/digests, never attributes."""
 def __init__(self, public, rows, clock, projection=None):
  super().__init__(public)
  self.rows, self.clock, self.projection = rows, clock, projection

def enabled(plan, root=None):
 name = (plan or {}).get('dataPreservation')
 if name is None:return False
 need(name == POLICY, 'DATA_POLICY_UNKNOWN')
 for key, count, schema, digest in [('from',84,SOURCE_SCHEMA,SOURCE_CHAIN),('to',86,TARGET_SCHEMA,TARGET_CHAIN)]:
  value = plan[key]
  need(value['schemaSha256'] == schema and len(value['migrations']) == count and
       hashlib.sha256(canonical(value['migrations'])).hexdigest() == digest, 'DATA_POLICY_CHAIN')
 need(plan['added'] == [{'name':n,'sha256':h} for n,h in MIGRATIONS.items()], 'DATA_POLICY_ADDITIONS')
 if root is not None:
  for name, digest in MIGRATIONS.items():
   need(sha(root/'backend/prisma/migrations'/name/'migration.sql') == digest, 'DATA_POLICY_SQL')
 return True

def read_rows(path, parse_values):
 """Parse the three permitted tables from the same bounded anonymous-memory dump."""
 rows = {n:{} for n in TABLES};total = count = 0
 with path.open(encoding='utf8') as stream:
  for line in stream:
   need(len(line) <= MAX_ROW_BYTES, 'DATA_POLICY_LINE_LIMIT')
   match = re.match(r'^INSERT INTO \x60([A-Za-z_][A-Za-z0-9_]*)\x60 \((.+)\) VALUES \((.*)\);\n?$', line)
   if not match or match[1] not in rows:continue
   total += len(line.encode());count += 1
   need(total <= MAX_ROW_BYTES and count <= MAX_ROWS, 'DATA_POLICY_MEMORY_LIMIT')
   columns = re.findall(r'\x60([A-Za-z_][A-Za-z0-9_]*)\x60', match[2])
   values = parse_values(match[3])
   need(len(columns) == len(values) and len(set(columns)) == len(columns), 'DATA_POLICY_COLUMNS')
   row = dict(zip(columns,values));identity = row.get('id')
   need(isinstance(identity,str) and identity.isdigit() and int(identity)>0 and identity not in rows[match[1]], 'DATA_POLICY_ROW_ID')
   rows[match[1]][identity] = row
 return rows

def clock(ops):
 value = ops.sql("SELECT DATE_FORMAT(CURRENT_TIMESTAMP(3),'%Y-%m-%d %H:%i:%s.%f')")
 need(len(value) == 1, 'DATA_POLICY_CLOCK')
 return dt.datetime.fromisoformat(value[0])

def projection(ops, root):
 """Evaluate the pinned SQL read-only against PRE-DDL facts, not resulting status.

The restricted migration fixture independently checks these situations against
the canonical backend projection. The SQL identity is mandatory, not arbitrary input.
"""
 file = root/'backend/prisma/migrations/20261013171000_requirement_lifecycle_basis/migration.sql'
 need(sha(file) == MIGRATIONS[file.parent.name], 'DATA_POLICY_SQL')
 sql = file.read_text()
 cte = sql[sql.index('WITH selected_requirements AS ('):sql.index('SELECT p.projectId, p.id, s.currentSituation')]
 old = "SELECT id, projectId FROM Requirement WHERE lifecycleBasis = 'LOCAL'"
 need(cte.count(old)==1, 'DATA_POLICY_PROJECTION')
 cte = cte.replace(old, "SELECT r.id, r.projectId FROM Requirement r LEFT JOIN ProjectGitHubIntegration g ON g.projectId=r.projectId WHERE g.id IS NULL")
 query = "SELECT JSON_ARRAY(id,projectId,situation) FROM ("+cte+"SELECT id,projectId,situation FROM situations) AS expected_projection"
 result = {}
 for value in ops.sql(query):
  identity, project, situation = json.loads(value);key = str(identity)
  need(key not in result and len(result)<MAX_ROWS, 'DATA_POLICY_PROJECTION_ID')
  result[key] = (str(project), situation)
 return result

def status(situation):
 if situation in ('SEM_RASTREABILIDADE','PLANEJADO'):return 'PLANEJADO'
 if situation in ('EM_DESENVOLVIMENTO','IMPLEMENTADO'):return 'EM_IMPLEMENTACAO'
 if situation in ('AGUARDANDO_VALIDACAO','EM_VALIDACAO','VALIDADO'):return 'EM_VALIDACAO'
 if situation in ('COM_FALHA','EM_CORRECAO','AGUARDANDO_RETESTE'):return 'EM_CORRECAO'
 need(situation == 'CONCLUIDO', 'DATA_POLICY_SITUATION')
 return 'CONCLUIDO'

def changed_time(old, new, column, changed, before, after):
 if not changed:
  need(new[column] == old[column], 'DATA_POLICY_UNEXPECTED_TIMESTAMP');return
 try:value = dt.datetime.fromisoformat(new[column])
 except (TypeError,ValueError):raise ValueError('DATA_POLICY_TIMESTAMP')
 need(before.clock <= value <= after.clock, 'DATA_POLICY_TIMESTAMP_WINDOW')

def compare(before, after, plan):
 """Every old row/column and every new transition must be accounted for."""
 if not enabled(plan):
  need(all(after['tables'].get(n)==v for n,v in before['tables'].items()), 'PREEXISTING_DATA_CHANGED_BY_MIGRATION')
  return {'policy':'strict'}
 need(isinstance(before,Snapshot) and isinstance(after,Snapshot) and before.projection is not None, 'DATA_POLICY_SNAPSHOT')
 need(before.clock <= after.clock, 'DATA_POLICY_CLOCK_ORDER')
 need(set(before['tables']) == set(after['tables']), 'DATA_POLICY_TABLE_SET')
 need(all(after['tables'][n]==v for n,v in before['tables'].items() if n not in TABLES), 'PREEXISTING_DATA_CHANGED_BY_MIGRATION')
 old, new = before.rows, after.rows
 requirements = old['Requirement'];target = new['Requirement']
 need(set(requirements)==set(target), 'DATA_POLICY_REQUIREMENT_IDENTITIES')
 need(set(before.projection)<=set(requirements), 'DATA_POLICY_PROJECTION_IDENTITIES')
 for identity, row in requirements.items():
  updated = target[identity]
  need(set(updated)==set(row)|{'lifecycleBasis'}, 'DATA_POLICY_REQUIREMENT_COLUMNS')
  local = identity in before.projection
  situation = before.projection[identity][1] if local else None
  if local:need(before.projection[identity][0]==row['projectId'], 'DATA_POLICY_PROJECT')
  expected_status = status(situation) if local else row['status']
  need(updated['lifecycleBasis']==('LOCAL' if local else 'GITHUB') and updated['status']==expected_status, 'DATA_POLICY_REQUIREMENT_PROJECTION')
  need(all(updated[k]==v for k,v in row.items() if k not in ('status','updatedAt')), 'DATA_POLICY_REQUIREMENT_IMMUTABLE')
  changed_time(row,updated,'updatedAt',row['status']!=expected_status,before,after)
 old_states = old['RequirementTraceabilityState'];new_states = new['RequirementTraceabilityState']
 need(set(old_states)<=set(new_states), 'DATA_POLICY_STATE_DELETED')
 by_requirement = {}
 for identity,row in old_states.items():
  need(row['requirementId'] not in by_requirement, 'DATA_POLICY_STATE_DUPLICATE')
  by_requirement[row['requirementId']] = row;updated = new_states[identity]
  situation = before.projection.get(row['requirementId'], (None,row['currentSituation']))[1]
  need(set(updated)==set(row) and updated['currentSituation']==situation, 'DATA_POLICY_STATE_PROJECTION')
  need(all(updated[k]==v for k,v in row.items() if k not in ('currentSituation','updatedAt')), 'DATA_POLICY_STATE_IMMUTABLE')
  changed_time(row,updated,'updatedAt',situation!=row['currentSituation'],before,after)
 missing = set(before.projection)-set(by_requirement);inserted = set(new_states)-set(old_states)
 need(len(inserted)==len(missing), 'DATA_POLICY_STATE_INSERTIONS')
 max_state = max(map(int,old_states),default=0)
 for identity in inserted:
  row = new_states[identity];rid = row['requirementId']
  need(set(row)=={'id','requirementId','currentSituation','updatedAt'} and int(identity)>max_state and rid in missing, 'DATA_POLICY_STATE_INSERTION')
  need(row['currentSituation']==before.projection[rid][1], 'DATA_POLICY_STATE_PROJECTION')
  changed_time({},row,'updatedAt',True,before,after);missing.remove(rid)
 old_history = old['RequirementTraceabilityHistoryEntry'];new_history = new['RequirementTraceabilityHistoryEntry']
 need(all(new_history.get(k)==v for k,v in old_history.items()), 'DATA_POLICY_HISTORY_REWRITTEN')
 expected = {}
 for rid,(project,situation) in before.projection.items():
  state = by_requirement.get(rid)
  if state is None or state['currentSituation'] != situation:
   expected[rid] = {'projectId':project,'requirementId':rid,'fromSituation':state['currentSituation'] if state else None,
    'toSituation':situation,'reason':'LIFECYCLE_BASIS_MIGRATION' if state else 'BASELINE_INITIALIZED',
    'sourceEntityType':'Migration','sourceEntityId':None}
 inserted = set(new_history)-set(old_history)
 need(len(inserted)==len(expected), 'DATA_POLICY_HISTORY_INSERTIONS')
 max_history = max(map(int,old_history),default=0)
 for identity in inserted:
  row = new_history[identity];rid = row['requirementId']
  need(rid in expected and int(identity)>max_history and set(row)==set(expected[rid])|{'id','metadataJson','occurredAt'}, 'DATA_POLICY_HISTORY_UNEXPECTED')
  need(all(row[k]==v for k,v in expected[rid].items()), 'DATA_POLICY_HISTORY_TRANSITION')
  try:metadata=json.loads(row['metadataJson'])
  except (TypeError,ValueError):raise ValueError('DATA_POLICY_HISTORY_METADATA')
  need(metadata=={'rulesVersion':4,'lifecycleBasis':'LOCAL','migrationReason':'LIFECYCLE_BASIS_MIGRATION'}, 'DATA_POLICY_HISTORY_METADATA')
  changed_time({},row,'occurredAt',True,before,after);del expected[rid]
 need(not expected, 'DATA_POLICY_HISTORY_MISSING')
 return {'policy':POLICY,'requirementsPreserved':len(requirements),'localRequirements':len(before.projection),
         'oldHistoryPreserved':len(old_history),'historyAppended':len(inserted)}

def verify_foreign_keys(ops):
 """Check every FK, including composite keys, without returning business values."""
 rows=ops.sql("SELECT JSON_ARRAY(TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION")
 keys={}
 for value in rows:
  table,name,column,parent,target=json.loads(value)
  need(all(isinstance(v,str) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',v) for v in (table,name,column,parent,target)), 'DATA_POLICY_FK_IDENTIFIER')
  keys.setdefault((table,name,parent),[]).append((column,target))
 for (table,_,parent),columns in keys.items():
  quote=lambda value:chr(96)+value+chr(96)
  populated=' AND '.join('c.'+quote(c)+' IS NOT NULL' for c,_ in columns)
  joined=' AND '.join('p.'+quote(p)+'=c.'+quote(c) for c,p in columns)
  result=ops.sql('SELECT COUNT(*) FROM '+quote(table)+' c WHERE '+populated+' AND NOT EXISTS (SELECT 1 FROM '+quote(parent)+' p WHERE '+joined+')')
  need(result==['0'], 'DATA_POLICY_FOREIGN_KEY_ORPHAN')
 return len(keys)
