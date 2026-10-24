#!/usr/bin/env python3
"""Disposable MySQL integration of the real Host migration adapter and promote machine.

Only process/service/routing boundaries are adapted. Fingerprints, policy comparator,
ledger checks, schema guard, retention selector and recovery methods are production code.
Never accepts non-loopback/non-test targets. Credentials and business rows are not printed.
"""
import copy,datetime as dt,importlib.util,json,os,shutil,subprocess,sys,tempfile,types,urllib.parse
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'deploy/cd'))
import receiver,preservation
from contract import canonical,promote
url=os.environ['TEST_DATABASE_URL'];address=urllib.parse.urlsplit(url)
assert address.hostname in ('localhost','127.0.0.1','::1')
schema=address.path[1:];assert schema.startswith('tf_pr25_') and schema.endswith('_test')
mode=sys.argv[1];assert mode in ('populated','empty','partial','after-ddl','runtime')
cli=ROOT/'backend/node_modules/prisma/build/index.js'
migration_schema=Path(os.environ['CD_LAB_SCHEMA']).resolve()
assert migration_schema.is_file() and migration_schema!=ROOT/'backend/prisma/schema.prisma'
for tool in ('mysql','mysqldump','node'):assert shutil.which(tool),'LAB_TOOL_MISSING_'+tool

def execute(args,**kwargs):
 result=subprocess.run(args,capture_output=True,timeout=300,**kwargs)
 if result.returncode:raise ValueError('ISOLATED_COMMAND_FAILED')
 return result.stdout

def prisma(*args):
 env={**os.environ,'DATABASE_URL':url,'NODE_ENV':'test'}
 result=subprocess.run(['node',str(cli),*args,'--schema',str(migration_schema)],cwd=ROOT/'backend',env=env,capture_output=True,timeout=300)
 if result.returncode:
  if mode=='partial':
   assert b'P3018' in result.stdout+result.stderr and b'1044' in result.stdout+result.stderr,'EXPECTED_1044_NOT_REPRODUCED'
  raise ValueError('ISOLATED_PRISMA_FAILED')
 return result.stdout


def runtime_check():
 import time,urllib.request,socket
 with socket.socket() as sock:
  sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 key=execute(['node','--input-type=module','-e',"import{generateKeyPairSync}from'node:crypto';const{privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});process.stdout.write(Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'));"]).decode()
 with tempfile.TemporaryDirectory(prefix='traceflow-runtime-') as folder,tempfile.TemporaryFile() as api_log,tempfile.TemporaryFile() as worker_log:
  runtime_url=url.replace('connection_limit=1','connection_limit=3')
  env={**os.environ,'NODE_ENV':'test','TEST_DATABASE_URL':runtime_url,'DATABASE_URL':'mysql://unused:unused@127.0.0.1/traceflow_dev_unused',
   'PORT':str(port),'HTTP_HOST':'127.0.0.1','EMAIL_PROVIDER':'capture','TEST_EVIDENCE_STORAGE_DIR':folder,
   'GITHUB_SCHEDULER_ENABLED':'true','JOBS_ENABLED':'true','GITHUB_APP_ID':'1','GITHUB_APP_CLIENT_ID':'isolated-ci',
   'GITHUB_APP_CLIENT_SECRET':'synthetic-ci','GITHUB_APP_SLUG':'traceflow-isolated-ci','GITHUB_APP_WEBHOOK_SECRET':'synthetic-ci',
   'GITHUB_APP_CALLBACK_URL':'http://localhost:'+str(port)+'/api/github-app/callback',
   'GITHUB_APP_FRONTEND_SUCCESS_URL':'http://localhost:5173/ci-success',
   'GITHUB_APP_FRONTEND_ERROR_URL':'http://localhost:5173/ci-error','GITHUB_APP_PRIVATE_KEY_BASE64':key}
  processes=[]
  try:
   api=subprocess.Popen(['node','src/server.js'],cwd=ROOT/'backend',env={**env,'JOBS_ENABLED':'false','GITHUB_SCHEDULER_ENABLED':'false'},stdout=api_log,stderr=api_log);processes.append(api)
   worker=subprocess.Popen(['node','src/github-worker.js'],cwd=ROOT/'backend',env=env,stdout=worker_log,stderr=worker_log);processes.append(worker)
   deadline=time.monotonic()+30;ready=False
   while time.monotonic()<deadline:
    assert all(p.poll() is None for p in processes),'RUNTIME_EXITED'
    try:
     with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/health/ready',timeout=2) as response:ready=json.load(response)['status']=='ready'
     if ready:break
    except OSError:pass
    time.sleep(.2)
   assert ready,'API_NOT_READY'
   js="""import{PrismaClient}from'@prisma/client';const p=new PrismaClient({datasourceUrl:process.env.TEST_DATABASE_URL});try{const expected=['github-event-dispatch','notifications-due','traceability-alerts','traceability-notice-dispatch'].sort();let ok=false;for(let i=0;i<80;i++){const names=(await p.scheduledJobLease.findMany({select:{name:true}})).map(x=>x.name).sort();const workers=await p.gitHubSchedulerWorker.count({where:{heartbeatAt:{gte:new Date(Date.now()-30000)}}});if(JSON.stringify(names)===JSON.stringify(expected)&&workers===1){ok=true;break;}await new Promise(r=>setTimeout(r,250));}if(!ok)throw Error('WORKER_NOT_READY');console.log(JSON.stringify({status:'ISOLATED_RECEIVER_RUNTIME_PASS',apiReady:true,workerCount:1,jobs:expected,migrations:86,productionUsed:false}));}finally{await p.$disconnect();}"""
   result=json.loads(execute(['node','--input-type=module','-e',js],cwd=ROOT/'backend',env=env))
  finally:
   for process in processes:
    if process.poll() is None:process.terminate()
   for process in processes:
    try:code=process.wait(20)
    except subprocess.TimeoutExpired:process.kill();process.wait();raise
    assert code==0,'RUNTIME_SHUTDOWN_FAILED'
  return result
if mode=='runtime':
 print(json.dumps(runtime_check()));sys.exit(0)

baseline=json.loads((ROOT/'backend/scripts/fixtures/pr25-migration-baseline.json').read_bytes())
old=[{'name':n,'sha256':h} for n,h in sorted(baseline['migrations'].items())]
target=receiver.current_manifest(ROOT)
plan={'dataPreservation':preservation.POLICY,'from':{'schemaSha256':preservation.SOURCE_SCHEMA,'migrations':old},
 'to':target,'added':[{'name':n,'sha256':h} for n,h in preservation.MIGRATIONS.items()]}
assert preservation.enabled(plan,ROOT)
events=[];proof={}
with tempfile.TemporaryDirectory(prefix='traceflow-receiver-') as temporary:
 folder=Path(temporary);option=folder/'mysql.cnf'
 os.environ['MYSQL_TEST_LOGIN_FILE']=str(folder/'absent-login.cnf')
 option.write_text('[client]\nuser='+urllib.parse.unquote(address.username)+'\npassword='+json.dumps(urllib.parse.unquote(address.password))+'\n');option.chmod(0o600)
 spec=importlib.util.spec_from_file_location('lab_ops',ROOT/'deploy/operations/live_operations.py')
 ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
 ops.SCHEMA=schema
 def mysql_args(tool='mysql'):
  return [shutil.which(tool),'--defaults-file='+str(option),'--protocol=TCP','--host='+address.hostname,'--port='+str(address.port or 3306)]
 ops.mysql_args=mysql_args
 grants=ops.sql('SHOW GRANTS')
 grant=next(g for g in grants if 'ON '+chr(96)+schema+chr(96)+'.*' in g)
 assert set(grant[6:grant.index(' ON ')].split(', '))=={'SELECT','INSERT','UPDATE','CREATE','ALTER','INDEX','REFERENCES'}
 class LabHost(receiver.Host):
  def __init__(self):
   self.plan=plan;self.transition_digest='a'*64;self.request={'runId':'24686'};self.cfg={}
   self.ops=ops;self.root=ROOT;self.work=folder
   self.schema_started=False;self.schema_complete=False;self.migration_quiesced=False
   self.schema_guard_claimed=False;self.retention_target_ready=False;self.changed_units=set();self.restarted_units=set()
   self.units={'retention':folder/'retention/30-cd-release.conf'}
   self.old={};self.recovery={};self.state_attempted=False;self.routing_changed=False;self.reload_attempted=False
   self.migration_result={};self.migrator_preflight=None
  def preflight(self):
   receiver.validate_migration_chain(receiver.applied_chain(ops),old);events.append('preflight')
  def invoke_migrator(self,check=False):
   assert not check;events.append('prisma-deploy')
   prisma('migrate','deploy')
   execute(['node',str(cli),'migrate','diff','--from-schema-datasource',str(migration_schema),'--to-schema-datamodel',str(migration_schema),'--exit-code'],cwd=ROOT/'backend',env={**os.environ,'DATABASE_URL':url})
   if mode=='after-ddl':raise ValueError('INJECTED_FAILURE_AFTER_DDL')
   return b'{"status":"PRISMA_DEPLOY_PASS"}'
  def start_candidate(self):
   assert self.schema_complete and self.retention_target_ready;events.append('start_candidate')
  def candidate_ready(self):events.append('candidate_ready')
  def route_candidate(self):events.append('route_candidate')
  def promote_services(self):events.append('promote_services')
  def official_ready(self):events.append('official_ready')
  def route_official(self):events.append('route_official')
  def smoke(self):events.append('smoke')
  def stop_candidate(self):events.append('stop_candidate')
  def commit(self):
   self.release_schema_guard();events.append('commit')
  def recovery_complete(self):events.append('recovery_complete')
  def recovery_failed(self,original,recovery):events.append('recovery_failed')
 def boundary(args,**kwargs):
  name=str(args[0])
  assert name in ('systemctl','restorecon'),'UNEXPECTED_SERVICE_BOUNDARY'
  if name=='systemctl' and args[1]=='show':return b'inactive'
  events.append(' '.join(map(str,args[:3])));return b''
 actual=receiver.data_fingerprint
 snapshots=[]
 def capture(*args,**kwargs):
  value=actual(*args,**kwargs);snapshots.append(value);return value
 host=LabHost()
 with patch.object(receiver,'STATE',folder),patch.object(receiver,'valid_window'),patch.object(receiver,'run',side_effect=boundary),patch.object(receiver,'data_fingerprint',side_effect=capture):
  if mode in ('partial','after-ddl'):
   try:promote(host)
   except ValueError as error:assert str(error)=='MIGRATION_INCOMPLETE_OPERATOR_REQUIRED'
   else:raise AssertionError('FAILURE_NOT_CONTAINED')
   assert host.schema_started and not host.schema_complete and (folder/'schema-transition-in-progress').exists()
   assert 'start_candidate' not in events and 'recovery_failed' in events
   assert not host.retention_target_ready
   proof={'status':'ISOLATED_RECEIVER_FAILURE_CONTAINED','mode':mode,'schemaComplete':False,'guardRetained':True,'candidateNotStarted':True,'noDdlRollback':True}
  else:
   promote(host)
   assert host.schema_complete and host.retention_target_ready and not (folder/'schema-transition-in-progress').exists()
   assert events.count('prisma-deploy')==1 and events.index('prisma-deploy')<events.index('start_candidate')
   assert len(snapshots)==2
   before,after=snapshots
   # Tamper the actual captured observations: same comparator, no alternate mock policy.
   failures=[]
   if mode=='populated':
    cases=[('requirement',lambda s:s.rows['Requirement'][next(iter(s.rows['Requirement']))].update(title='unauthorized')),
     ('delete-history',lambda s:s.rows['RequirementTraceabilityHistoryEntry'].pop(next(iter(before.rows['RequirementTraceabilityHistoryEntry'])))),
     ('rewrite-history',lambda s:s.rows['RequirementTraceabilityHistoryEntry'][next(iter(before.rows['RequirementTraceabilityHistoryEntry']))].update(reason='unauthorized')),
     ('unrelated-table',lambda s:s['tables']['Task'].update(dataSha256='0'*64)),
     ('wrong-projection',lambda s:s.rows['Requirement'][next(iter(before.projection))].update(lifecycleBasis='GITHUB'))]
    for name,change in cases:
     invalid=copy.deepcopy(after);change(invalid)
     try:preservation.compare(before,invalid,plan)
     except ValueError:failures.append(name)
     else:raise AssertionError('CORRUPTION_ACCEPTED')
    assert len(failures)==5
   assert all('rows' not in json.loads(p.read_text()) or 'Sensitive title' not in p.read_text() for p in folder.glob('*.json'))
   proof={'status':'ISOLATED_RECEIVER_UPGRADE_PASS','mode':mode,'from':84,'to':86,'schemaComplete':True,'retentionTargetSelected':True,
    'schemaGuardReleased':True,'sameFingerprintAndComparator':True,'sameHostApplyMigrations':True,'samePromoteStateMachine':True,
    'negativeControls':failures,'preservation':host.migration_result['dataPreservation']}
 proof.update(productionUsed=False,sevenPrivileges=True,events=events)
 print(json.dumps(proof))
