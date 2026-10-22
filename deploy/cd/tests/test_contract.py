import hashlib,http.server,importlib.util,io,json,os,sys,tarfile,tempfile,threading,unittest,urllib.request
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from contract import promote,unpack,schema_gate
class Probe(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  good=self.server.state['ready'];self.send_response(200 if good else 503);self.end_headers();self.wfile.write(b'ready' if good else b'not-ready')
 def log_message(self,*_):pass
class Lab:
 def __init__(self,fail=None):
  self.fail=fail;self.events=[];self.route='previous';self.application='previous';self.state={'ready':True};self.candidate=False
  self.http=http.server.ThreadingHTTPServer(('127.0.0.1',0),Probe);self.http.state=self.state;self.thread=threading.Thread(target=self.http.serve_forever,daemon=True);self.thread.start()
 def step(self,n):
  self.events.append(n)
  if self.fail==n:raise ValueError('INJECTED_'+n)
 def preflight(self):self.step('preflight')
 def start_candidate(self):self.candidate=True;self.step('startup')
 def candidate_ready(self):
  self.state['ready']=self.fail!='readiness'
  try:urllib.request.urlopen('http://127.0.0.1:'+str(self.http.server_port),timeout=2).read()
  except Exception:raise ValueError('REAL_HTTP_READINESS_REFUSED')
 def route_candidate(self):self.route='candidate';self.step('route_candidate')
 def promote_services(self):self.application='candidate';self.step('worker')
 def official_ready(self):self.step('official_ready')
 def route_official(self):self.route='official';self.step('route_official')
 def smoke(self):self.step('smoke')
 def commit(self):self.step('commit')
 def restore_previous(self):self.route='previous';self.application='previous';self.step('rollback');return True
 def recovery_complete(self):self.step('recovery_complete')
 def recovery_failed(self,original,recovery):self.step('recovery_incomplete')
 def previous_ready(self):self.state['ready']=True;self.step('previous_ready')
 def stop_candidate(self):self.candidate=False;self.events.append('candidate_stopped')
 def close(self):self.http.shutdown();self.http.server_close();self.thread.join()
class TransactionTests(unittest.TestCase):
 def test_real_http_success_and_candidate_cleanup(self):
  lab=Lab()
  try:promote(lab);self.assertEqual(lab.application,'candidate');self.assertFalse(lab.candidate);self.assertNotIn('rollback',lab.events)
  finally:lab.close()
 def test_startup_and_readiness_fail_before_public_cutover(self):
  for failure in ('startup','readiness'):
   lab=Lab(failure)
   try:
    with self.assertRaises(ValueError):promote(lab)
    self.assertEqual((lab.application,lab.route),('previous','previous'));self.assertFalse(lab.candidate)
   finally:lab.close()
 def test_worker_readiness_smoke_and_route_failures_restore_previous(self):
  for failure in ('route_candidate','worker','official_ready','route_official','smoke','commit'):
   lab=Lab(failure)
   try:
    with self.assertRaises(ValueError):promote(lab)
    self.assertEqual((lab.application,lab.route),('previous','previous'));self.assertIn('previous_ready',lab.events);self.assertFalse(lab.candidate)
   finally:lab.close()
 def test_interruption_after_cutover_runs_same_rollback(self):
  lab=Lab()
  def interrupt():raise KeyboardInterrupt()
  lab.official_ready=interrupt
  try:
   with self.assertRaises(KeyboardInterrupt):promote(lab)
   self.assertEqual(lab.application,'previous');self.assertFalse(lab.candidate);self.assertIn('previous_ready',lab.events)
  finally:lab.close()
 def test_preflight_refusal_never_starts_or_changes_application(self):
  lab=Lab('preflight')
  try:
   with self.assertRaises(ValueError):promote(lab)
   self.assertEqual(lab.events,['preflight']);self.assertEqual(lab.application,'previous')
  finally:lab.close()
 def test_schema_same_allowed_change_or_migration_tampering_refused(self):
  one={'schemaSha256':'a','migrations':[{'name':'first','sha256':'a'}]};schema_gate(one,one)
  for other in ({**one,'schemaSha256':'b'},{**one,'migrations':[]},{**one,'migrations':[{'name':'first','sha256':'changed'}]}):
   with self.assertRaisesRegex(ValueError,'SCHEMA_CHANGE'):schema_gate(one,other)
 def archive(self,folder,members):
  p=folder/'package.tar.gz'
  with tarfile.open(p,'w:gz') as t:
   for name,data,kind in members:
    m=tarfile.TarInfo(name);m.type=kind;m.size=len(data);m.linkname='../../etc/passwd';t.addfile(m,io.BytesIO(data))
  return p
 def test_bad_digest_and_archive_scope_never_install(self):
  for name,kind in [('../etc/passwd',tarfile.REGTYPE),('/etc/passwd',tarfile.REGTYPE),('backend/link',tarfile.SYMTYPE),('unrelated',tarfile.REGTYPE)]:
   with tempfile.TemporaryDirectory() as d:
    root=Path(d);p=self.archive(root,[(name,b'x',kind)]);dest=root/'out'
    with self.assertRaises(ValueError):unpack(p,dest,hashlib.sha256(p.read_bytes()).hexdigest())
    self.assertFalse(dest.exists())
 def test_valid_manifest_and_real_file_hashes(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);data=b'non-sensitive';manifest={'formatVersion':1,'kind':'traceflow-clean-cd','commit':'a'*40,'files':{'backend/src/server.js':{'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'mode':420}}}
   p=self.archive(root,[('cd-manifest.json',json.dumps(manifest).encode(),tarfile.REGTYPE),('backend/src/server.js',data,tarfile.REGTYPE)])
   previous=os.umask(0o077)
   try:result=unpack(p,root/'out',hashlib.sha256(p.read_bytes()).hexdigest())
   finally:os.umask(previous)
   self.assertEqual(result,manifest);self.assertEqual((root/'out/backend/src').stat().st_mode&0o777,0o755)
if __name__=='__main__':unittest.main()
