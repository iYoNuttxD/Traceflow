"""Real local pipes/processes, synthetic bytes only. Never starts MySQL."""
import contextlib,importlib.util,os,signal,sys,tempfile,time,unittest
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'deploy/lib'))
from release_contract import Refused
from operational_io import tool
from activation_accounts import TextSession,Accounts
from runtime_grants import MODEL
class IOTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='tf0710-io-',dir=ROOT/'build');self.root=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_empty_input_is_not_inherited_terminal(self):
        self.assertEqual(tool([sys.executable,'-c','import sys; print(len(sys.stdin.buffer.read()))']),b'0\n')
        self.assertEqual(tool([sys.executable,'-c','import sys; print(len(sys.stdin.buffer.read()))'],input=b''),b'0\n')
    def test_stderr_and_nonzero_are_sanitized(self):
        for code in ('import sys; sys.stderr.write("synthetic-secret");sys.exit(1)','import sys;sys.stderr.write("synthetic-secret")'):
            with self.assertRaises(Refused) as error:tool([sys.executable,'-c',code])
            self.assertNotIn('synthetic-secret',str(error.exception))
    def test_limit_and_timeout(self):
        with self.assertRaisesRegex(Refused,'TOOL_OUTPUT_LIMIT'):tool([sys.executable,'-c','print("x"*1000)'],maximum=10)
        started=time.monotonic()
        with self.assertRaisesRegex(Refused,'TOOL_TIMEOUT'):tool([sys.executable,'-c','import time;time.sleep(5)'],timeout=.15)
        self.assertLess(time.monotonic()-started,4)
    def test_blocked_stdin_is_also_bounded(self):
        started=time.monotonic()
        with self.assertRaisesRegex(Refused,'TOOL_TIMEOUT'):
            tool([sys.executable,'-c','import time;time.sleep(30)'],input=b'x'*120000,timeout=.2)
        self.assertLess(time.monotonic()-started,3)
    def test_oversized_input_never_spawns(self):
        with mock.patch('operational_io.subprocess.Popen') as spawn,self.assertRaisesRegex(Refused,'TOOL_INPUT_LIMIT'):
            tool(['not-executed'],input=b'x'*131073)
        spawn.assert_not_called()
    def test_descendant_holding_pipe_is_terminated(self):
        pidfile=self.root/'pid'
        code='import os,time,pathlib; p=os.fork(); pathlib.Path('+repr(str(pidfile))+').write_text(str(os.getpid())) if p==0 else None; time.sleep(30) if p==0 else os._exit(0)'
        with self.assertRaisesRegex(Refused,'TOOL_TIMEOUT'):tool([sys.executable,'-c',code],timeout=.3)
        pid=int(pidfile.read_text());deadline=time.monotonic()+2
        while time.monotonic()<deadline:
            try:os.kill(pid,0)
            except ProcessLookupError:break
            # A reparented zombie has closed its FDs and cannot execute; Linux PID1 reaps it.
            p=Path('/proc')/str(pid)/'stat'
            if p.exists() and ') Z ' in p.read_text():break
            time.sleep(.05)
        else:self.fail('descendant survived timeout')
    def fake_client(self,warning=False):
        script=self.root/'client.py'
        script.write_text('''import sys
for line in sys.stdin:
 if "TF_W02_IDENTITY_START_BEGIN" in line: print("TF_W02_IDENTITY_START_BEGIN\\t23",flush=True)
 elif "TF_W02_IDENTITY_START_END" in line: print("TF_W02_IDENTITY_START_END\\t23",flush=True)
 elif "SHOW COUNT" in line: print("'''+('1' if warning else '0')+'''",flush=True)
 elif "JSON_ARRAY" in line: print('["uuid","version",3306,"admin",23,"public",0,1,1,1]',flush=True)
''')
        return script
    def test_text_session_incremental_frames_and_close(self):
        script=self.fake_client();fd=os.open(script,os.O_RDONLY)
        try:
            with TextSession([sys.executable,'-B',str(script)],fd) as client:
                rows,cid=client.query([MODEL['plan'][0]])
                self.assertEqual(cid,'23');self.assertEqual(rows['IDENTITY_START'][0][0],'uuid')
        finally:os.close(fd)
        self.assertEqual(client.p.returncode,0)
    def test_text_session_warnings_refused(self):
        script=self.fake_client(True);fd=os.open(script,os.O_RDONLY)
        try:
            with self.assertRaisesRegex(Refused,'ADMIN_WARNINGS'):
                with TextSession([sys.executable,'-B',str(script)],fd) as client:client.query([MODEL['plan'][0]])
        finally:os.close(fd)
        self.assertIsNotNone(client.p.returncode)
    def test_wrong_identity_never_sends_alter(self):
        account=Accounts.__new__(Accounts);account.path=self.root/'synthetic';account.path.write_bytes(b'fixture');account.sha='fixture-sha'
        session=mock.MagicMock();session.__enter__.return_value=session
        session.query.return_value=({'IDENTITY_START':[['wrong-server']]},'23')
        with mock.patch('activation_accounts.secure_read',return_value=b'fixture'),mock.patch('activation_accounts.digest',return_value='fixture-sha'),\
             mock.patch('activation_accounts.TextSession',return_value=session):
            with self.assertRaisesRegex(Refused,'MUTATION_IDENTITY'):account.change('traceflow_api',False)
        self.assertEqual(session.query.call_count,1)
        self.assertNotIn('ALTER',str(session.query.call_args))
if __name__=='__main__':unittest.main()
