import copy,datetime as dt,hashlib,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import preservation as p
from contract import canonical

ROOT=Path(__file__).resolve().parents[3]
def plan():
 baseline=json.loads((ROOT/'backend/scripts/fixtures/pr25-migration-baseline.json').read_text())
 old=[{'name':n,'sha256':h} for n,h in sorted(baseline['migrations'].items())]
 new=[{'name':f.parent.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted((ROOT/'backend/prisma/migrations').glob('*/migration.sql'))]
 return {'dataPreservation':p.POLICY,'from':{'schemaSha256':p.SOURCE_SCHEMA,'migrations':old},
  'to':{'schemaSha256':p.TARGET_SCHEMA,'migrations':new},'added':[{'name':n,'sha256':h} for n,h in p.MIGRATIONS.items()]}

def snapshots():
 time='2026-10-24 06:00:00.000'
 row={'id':'1','projectId':'2','title':'Sensitive title must not be serialized','status':'PLANEJADO','updatedAt':time}
 states={'1':{'id':'1','requirementId':'1','currentSituation':'PLANEJADO','updatedAt':time}}
 history={'5':{'id':'5','requirementId':'1','projectId':'2','fromSituation':None,'toSituation':'PLANEJADO','reason':'BASELINE_INITIALIZED','sourceEntityType':None,'sourceEntityId':None,'metadataJson':None,'occurredAt':time}}
 rows={'Requirement':{'1':row,'2':{**row,'id':'2','projectId':'3'}},'RequirementTraceabilityState':states,'RequirementTraceabilityHistoryEntry':history}
 public={'tables':{n:{'rows':1,'dataSha256':'a'*64} for n in [*p.TABLES,'Task']},'ledger':{'old':'a'*64}}
 before=p.Snapshot(public,rows,dt.datetime(2026,10,24,6),{'1':('2','CONCLUIDO')})
 after=copy.deepcopy(before);after.clock+=dt.timedelta(seconds=2);after.projection=None
 after.rows['Requirement']['1'].update(status='CONCLUIDO',lifecycleBasis='LOCAL',updatedAt='2026-10-24 06:00:01.000')
 after.rows['Requirement']['2']['lifecycleBasis']='GITHUB'
 after.rows['RequirementTraceabilityState']['1'].update(currentSituation='CONCLUIDO',updatedAt='2026-10-24 06:00:01.000')
 after.rows['RequirementTraceabilityHistoryEntry']['6']={**history['5'],'id':'6','fromSituation':'PLANEJADO','toSituation':'CONCLUIDO','reason':'LIFECYCLE_BASIS_MIGRATION','sourceEntityType':'Migration','metadataJson':json.dumps({'rulesVersion':4,'lifecycleBasis':'LOCAL','migrationReason':'LIFECYCLE_BASIS_MIGRATION'}),'occurredAt':'2026-10-24 06:00:01.000'}
 return before,after

class PreservationTests(unittest.TestCase):
 def test_identity_is_bound_to_both_full_chains_schemas_and_added_sql(self):
  value=plan();self.assertTrue(p.enabled(value,ROOT))
  for field in ('from','to'):
   changed=copy.deepcopy(value);changed[field]['migrations'][0]['sha256']='0'*64
   with self.assertRaisesRegex(ValueError,'DATA_POLICY_CHAIN'):p.enabled(changed)
  value['added'][0]['sha256']='0'*64
  with self.assertRaisesRegex(ValueError,'ADDITIONS'):p.enabled(value)
  with self.assertRaisesRegex(ValueError,'UNKNOWN'):p.enabled({'dataPreservation':'anything'})
 def test_legitimate_backfill_and_append_only_history_pass(self):
  before,after=snapshots();proof=p.compare(before,after,plan())
  self.assertEqual(proof['historyAppended'],1);self.assertEqual(proof['requirementsPreserved'],2)
 def test_default_policy_remains_strict(self):
  before,after=snapshots();after['tables']['Requirement']['dataSha256']='b'*64
  with self.assertRaisesRegex(ValueError,'PREEXISTING'):p.compare(before,after,{})
 def test_business_data_is_never_serialized(self):
  before,_=snapshots();text=json.dumps(before)
  for value in ('Sensitive','title','projection','currentSituation'):self.assertNotIn(value,text)
 def test_unauthorized_changes_fail_closed(self):
  cases=[
   ('Requirement','1','title','tampered'),
   ('Requirement','1','projectId','99'),
   ('Requirement','1','status','PLANEJADO'),
   ('Requirement','1','lifecycleBasis','GITHUB'),
   ('Requirement','2','lifecycleBasis','LOCAL'),
   ('Requirement','2','updatedAt','2026-10-24 06:00:01.000'),
   ('RequirementTraceabilityState','1','currentSituation','IMPLEMENTADO'),
   ('RequirementTraceabilityState','1','requirementId','2'),
   ('RequirementTraceabilityHistoryEntry','5','reason','tampered'),
   ('RequirementTraceabilityHistoryEntry','6','reason','wrong'),
   ('RequirementTraceabilityHistoryEntry','6','metadataJson','{}'),
   ('RequirementTraceabilityHistoryEntry','6','fromSituation','CONCLUIDO'),
   ('RequirementTraceabilityHistoryEntry','6','sourceEntityId','1'),
   ('Requirement','1','updatedAt','2030-01-01 00:00:00.000'),
  ]
  for table,identity,key,value in cases:
   with self.subTest(table=table,key=key):
    before,after=snapshots();after.rows[table][identity][key]=value
    with self.assertRaises(ValueError):p.compare(before,after,plan())
 def test_deletions_duplicates_and_unrelated_data_fail(self):
  for table,identity in [('Requirement','1'),('RequirementTraceabilityState','1'),('RequirementTraceabilityHistoryEntry','5')]:
   before,after=snapshots();del after.rows[table][identity]
   with self.subTest(table=table),self.assertRaises(ValueError):p.compare(before,after,plan())
  before,after=snapshots();after.rows['RequirementTraceabilityHistoryEntry']['7']={**after.rows['RequirementTraceabilityHistoryEntry']['6'],'id':'7'}
  with self.assertRaises(ValueError):p.compare(before,after,plan())
  before,after=snapshots();after['tables']['Task']['dataSha256']='0'*64
  with self.assertRaisesRegex(ValueError,'PREEXISTING'):p.compare(before,after,plan())
 def test_missing_initial_state_is_permitted_only_with_corresponding_baseline_history(self):
  before,after=snapshots();before.rows['RequirementTraceabilityState']={}
  after.rows['RequirementTraceabilityHistoryEntry']['6'].update(reason='BASELINE_INITIALIZED',fromSituation=None)
  self.assertEqual(p.compare(before,after,plan())['historyAppended'],1)
 def test_empty_database_and_no_change_are_valid(self):
  before,after=snapshots()
  before.rows={n:{} for n in p.TABLES};after.rows=copy.deepcopy(before.rows);before.projection={}
  self.assertEqual(p.compare(before,after,plan())['historyAppended'],0)

 def test_foreign_keys_include_composite_keys_and_reject_orphans(self):
  class Ops:
   def __init__(self,orphan=False):self.calls=[];self.orphan=orphan
   def sql(self,query):
    self.calls.append(query)
    if len(self.calls)==1:return [json.dumps(['Child','fk','a','Parent','a']),json.dumps(['Child','fk','b','Parent','b'])]
    return ['1' if self.orphan else '0']
  ops=Ops();self.assertEqual(p.verify_foreign_keys(ops),1)
  self.assertIn('c.'+chr(96)+'a'+chr(96)+' IS NOT NULL AND c.'+chr(96)+'b'+chr(96)+' IS NOT NULL',ops.calls[1])
  with self.assertRaisesRegex(ValueError,'FOREIGN_KEY_ORPHAN'):p.verify_foreign_keys(Ops(True))
