"""Exercise actual Host file writes/recovery; systemd commands are isolated doubles."""
import contextlib,importlib.util,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import receiver
from contract import promote
class HostRecoveryTests(unittest.TestCase):
 @contextlib.contextmanager
 def lab(self,fail=None,interrupted=False):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);state=root/'state';state.mkdir();current=state/'current.json';current.write_bytes(b'{"original":"unchanged bytes"}\n')
   def local_path(value):
    value=str(value)
    return root/value.lstrip('/') if value.startswith(('/etc/','/opt/','/var/')) else Path(value)
   for path,data in [('/etc/nginx/traceflow-live/proxy.conf',b'proxy_pass http://127.0.0.1:3001;\n'),('/etc/nginx/conf.d/traceflow.conf',b'root /var/www/previous;\n')]:
    p=local_path(path);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
   with patch.object(receiver,'Path',side_effect=local_path),patch.object(receiver,'FRONTENDS',root/'frontends'):
    host=receiver.Host(root/'candidate',{}, {},root,{'currentRelease':'/opt/previous','frontendRoot':'/var/www/previous','nginxSha256':'old','proxySha256':'old'})
   (root/'etc/systemd/system').mkdir(parents=True,exist_ok=True)
   events=[];failed=False
   def command(args,**kwargs):
    nonlocal failed
    command=tuple(map(str,args));events.append(command)
    matches=(fail=='nginx' and command==('nginx','-t')) or (fail=='reload' and command==('systemctl','reload','nginx')) or (fail in ('api','worker') and command==('systemctl','restart','traceflow-live-'+fail)) or (fail=='dropin' and command[0]=='restorecon')
    if matches and not failed:
     failed=True
     if interrupted:raise KeyboardInterrupt()
     raise ValueError('COMMAND_FAILED_IN_LAB')
    return b''
   host.preflight=lambda:None;host.start_candidate=lambda:None;host.candidate_ready=lambda:None
   host.official_ready=lambda:None;host.smoke=lambda:None;host.stop_candidate=lambda:None
   host.previous_ready=lambda:events.append(('previous_ready',))
   with patch.object(receiver,'run',side_effect=command),patch.object(receiver,'valid_window',return_value=None),patch.object(receiver,'STATE',state):
    yield host,events,current
 def restarts(self,events):return [e[-1] for e in events if e[:2]==('systemctl','restart')]
 def test_nginx_test_refusal_restores_files_without_reload_restart_or_state_write(self):
  with self.lab('nginx') as (host,events,current):
   before=current.read_bytes()
   with self.assertRaisesRegex(ValueError,'COMMAND_FAILED'):promote(host)
   self.assertEqual(host.proxy.read_bytes(),host.old_proxy);self.assertEqual(host.nginx.read_bytes(),host.old_nginx)
   self.assertEqual(self.restarts(events),[]);self.assertNotIn(('systemctl','reload','nginx'),events)
   self.assertEqual(current.read_bytes(),before);self.assertEqual(events.count(('nginx','-t')),2)
   self.assertEqual(host.recovery['status'],'complete');self.assertNotIn(('previous_ready',),events)
 def test_window_refusal_before_write_touches_no_files_or_services(self):
  with self.lab() as (host,events,current),patch.object(receiver,'valid_window',side_effect=ValueError('EXPIRED')):
   before=current.read_bytes()
   with self.assertRaisesRegex(ValueError,'EXPIRED'):promote(host)
   self.assertEqual(events,[]);self.assertEqual(current.read_bytes(),before);self.assertEqual(host.proxy.read_bytes(),host.old_proxy)
 def test_failed_reload_is_uncertain_and_restores_ingress_without_service_restart(self):
  with self.lab('reload') as (host,events,current):
   with self.assertRaises(ValueError):promote(host)
   self.assertEqual(self.restarts(events),[]);self.assertEqual(events.count(('systemctl','reload','nginx')),2)
   self.assertIn(('previous_ready',),events);self.assertEqual(host.nginx.read_bytes(),host.old_nginx)
 def test_dropin_write_failure_restores_only_changed_dropin_without_restart(self):
  with self.lab('dropin') as (host,events,current):
   with self.assertRaises(ValueError):promote(host)
   self.assertEqual(host.changed_units,{'api'});self.assertEqual(self.restarts(events),[])
   self.assertFalse(host.units['api'].exists());self.assertFalse(host.units['worker'].exists())
 def test_partial_api_restart_failure_recovers_only_attempted_api(self):
  with self.lab('api') as (host,events,current):
   with self.assertRaises(ValueError):promote(host)
   self.assertEqual(self.restarts(events),['traceflow-live-api','traceflow-live-api'])
   self.assertFalse(any(p.exists() for p in host.units.values()));self.assertIn(('previous_ready',),events)
 def test_worker_restart_failure_recovers_both_attempted_services(self):
  with self.lab('worker') as (host,events,current):
   with self.assertRaises(ValueError):promote(host)
   self.assertEqual(self.restarts(events),['traceflow-live-api','traceflow-live-worker']*2)
   self.assertEqual(host.proxy.read_bytes(),host.old_proxy);self.assertFalse(any(p.exists() for p in host.units.values()))
 def test_interrupt_during_first_reload_runs_same_conservative_recovery(self):
  with self.lab('reload',interrupted=True) as (host,events,current):
   with self.assertRaises(KeyboardInterrupt):promote(host)
   self.assertEqual(self.restarts(events),[]);self.assertEqual(events.count(('systemctl','reload','nginx')),2)
 def test_failure_after_service_promotion_restores_existing_dropin_and_state_if_attempted(self):
  for failure in ('smoke','commit'):
   with self.subTest(failure=failure),self.lab() as (host,events,current):
    p=host.units['api'];p.parent.mkdir(parents=True);p.write_bytes(b'[Service]\n# previous audited dropin\n');host.old[str(p)]=p.read_bytes()
    def refuse():
     if failure=='commit':host.state_attempted=True;current.write_bytes(b'{"candidate":true}')
     raise ValueError('FINAL_CHECK_REFUSED')
    setattr(host,failure,refuse)
    with self.assertRaisesRegex(ValueError,'FINAL_CHECK_REFUSED'):promote(host)
    self.assertEqual(p.read_bytes(),host.old[str(p)]);self.assertFalse(host.units['worker'].exists())
    self.assertEqual(self.restarts(events),['traceflow-live-api','traceflow-live-worker']*2)
    if failure=='commit':self.assertEqual(json.loads(current.read_bytes()),host.previous_state)
 def test_success_never_recovers_and_commits_candidate(self):
  with self.lab() as (host,events,current):
   # Actual commit hashes the candidate files created by real route methods.
   promote(host)
   self.assertEqual(json.loads(current.read_bytes())['currentRelease'],str(host.root));self.assertEqual(host.recovery['status'],'not-needed')
   self.assertEqual(self.restarts(events),['traceflow-live-api','traceflow-live-worker']);self.assertNotIn(('previous_ready',),events)
 def test_recovery_failure_is_not_reported_complete(self):
  with self.lab('nginx') as (host,events,current):
   def refuse():raise ValueError('RECOVERY_TEST_REFUSED')
   host.restore_previous=refuse
   with self.assertRaisesRegex(ValueError,'RECOVERY_TEST_REFUSED'):promote(host)
   self.assertEqual(host.recovery['status'],'incomplete');self.assertEqual(host.recovery['originalFailure'],'COMMAND_FAILED_IN_LAB');self.assertEqual(host.recovery['recoveryFailure'],'RECOVERY_TEST_REFUSED')
 def test_recovery_diagnostics_never_expose_free_form_exception_values(self):
  with self.lab() as (host,events,current):
   host.recovery_failed(ValueError('synthetic credential must stay private'),ValueError('RECOVERY_REFUSED'))
   self.assertEqual(host.recovery,{'status':'incomplete','originalFailure':'UNCLASSIFIED_FAILURE','recoveryFailure':'RECOVERY_REFUSED'})

class SandboxUnitTests(unittest.TestCase):
 def test_versioned_unit_only_adds_three_specific_files_to_existing_sandbox(self):
  base=Path(__file__).resolve().parents[1]
  unit=(base/'traceflow-live-cd.service').read_text()
  values=dict(line.split('=',1) for line in unit.splitlines() if '=' in line)
  self.assertEqual(values['ProtectSystem'],'strict')
  for key in ('NoNewPrivileges','PrivateTmp','PrivateDevices','ProtectHome','ProtectKernelTunables','ProtectKernelModules','ProtectKernelLogs','ProtectControlGroups','RestrictSUIDSGID','RestrictRealtime','LockPersonality'):self.assertEqual(values[key],'yes')
  self.assertEqual(values['MemorySwapMax'],'0');self.assertEqual(values['LimitCORE'],'0');self.assertEqual(values['UMask'],'0077')
  paths=set(values['ReadWritePaths'].split())
  expected={'/var/lib/traceflow-live-ops/backup.lock','/var/lib/traceflow-live-cd','/var/www/traceflow-live-releases','/var/www/traceflow-live-deploy-status','/opt/traceflow-live/releases','/etc/systemd/system','/etc/nginx/conf.d/traceflow.conf','/etc/nginx/traceflow-live/proxy.conf','/run/nginx.pid','/var/log/nginx/error.log','/var/log/nginx/traceflow-access.log'}
  self.assertEqual(paths,expected)
  self.assertIn("unit=(source/'traceflow-live-cd.service').read_text()",(base/'install.py').read_text())
if __name__=='__main__':unittest.main()
