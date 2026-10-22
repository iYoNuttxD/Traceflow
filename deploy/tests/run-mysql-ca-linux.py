#!/usr/bin/env python3
"""OCI061 filesystem/systemd proof, ONLY in a new marked Lima tf061 VM.

No database, production credential, network call or global trust installation.
Run as root in /opt/traceflow-oci061 with deploy/ copied from the public sources.
"""
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
sys.dont_write_bytecode = True


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode: raise RuntimeError('LAB_COMMAND_FAILED_' + Path(args[0]).name)
    return result.stdout.strip()


def main():
    assert os.geteuid() == 0 and socket.gethostname() == 'lima-tf061'
    marker = Path('/run/traceflow-oci061-disposable')
    assert marker.is_file() and not marker.is_symlink() and marker.stat().st_mode & 0o077 == 0
    assert marker.read_text().strip() == os.environ['TF061_VM_TOKEN']
    assert command(['systemd-detect-virt']) != 'none'
    assert command(['getenforce']) == 'Enforcing'
    repo = Path(__file__).resolve().parents[2]
    assert repo == Path('/opt/traceflow-oci061')
    public = repo / 'public'; public.mkdir(mode=0o755, exist_ok=True); public.chmod(0o755)
    private = Path(tempfile.mkdtemp(prefix='tf061-private-', dir='/run')); private.chmod(0o700)
    report = {'environment': 'Oracle Linux 9.8 aarch64; local disposable VM', 'productionCertified': False, 'checks': []}
    units = ['traceflow-api.service', 'traceflow-github-worker.service']
    try:
        try: account = pwd.getpwnam('traceflow')
        except KeyError:
            command(['useradd', '--system', '--user-group', '--shell', '/sbin/nologin', 'traceflow']); account = pwd.getpwnam('traceflow')
        assert account.pw_uid != 0 and account.pw_shell == '/sbin/nologin'
        config = private / 'ca.cnf'
        config.write_text('[req]\ndistinguished_name=dn\nx509_extensions=root_ca\n[dn]\n[root_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n')
        ca = private / 'synthetic.pem'
        command(['openssl', 'req', '-config', str(config), '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(private / 'synthetic.key'), '-out', str(ca), '-days', '2', '-subj', '/CN=Synthetic OCI061 root'])
        der = subprocess.check_output(['openssl', 'x509', '-in', str(ca), '-outform', 'DER'])
        digest = hashlib.sha256(der).hexdigest()
        prepare = ['python3', str(repo / 'deploy/scripts/prepare-mysql-ca.py'), '--source', str(ca), '--expected-sha256', digest]
        plan = json.loads(command(prepare)); assert plan['status'] == 'PLAN'
        created = json.loads(command(prepare + ['--apply'])); assert created['status'] == 'CREATED'
        again = json.loads(command(prepare + ['--apply'])); assert again['status'] == 'UNCHANGED'
        target = Path('/etc/pki/traceflow/mysql-ca.pem')
        command(['restorecon', '/etc/pki/traceflow', str(target)])
        context = command(['matchpathcon', '-V', str(target)])
        report['checks'].append({'name': 'public-ca-plan-install-idempotent', 'status': 'PASS', 'mode': oct(target.stat().st_mode & 0o777), 'uid': target.stat().st_uid, 'context': context, 'fingerprint': digest})
        for path in ['/etc/nginx/ssl', '/etc/traceflow', '/var/lib/traceflow/test-evidence', '/home/traceflow-ca-fixture']:
            Path(path).mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ca, '/home/traceflow-ca-fixture/ca.pem')
        os.chown('/var/lib/traceflow/test-evidence', pwd.getpwnam('traceflow').pw_uid, pwd.getpwnam('traceflow').pw_gid)
        os.chmod('/var/lib/traceflow/test-evidence', 0o700)
        probe = public / 'probe.py'
        probe.write_text('''import os, sys, json, hashlib
from pathlib import Path
assert os.geteuid() != 0
ca=Path('/etc/pki/traceflow/mysql-ca.pem'); content=ca.read_bytes()
assert content.startswith(b'-----BEGIN CERTIFICATE-----')
assert ca.stat().st_uid == 0 and ca.stat().st_mode & 0o022 == 0
for path in [str(ca), '/opt/traceflow-oci061/public/write-denied']:
 try:
  with open(path, 'ab') as f: f.write(b'unexpected')
 except (PermissionError, OSError): pass
 else: raise AssertionError('sandbox write unexpectedly succeeded')
assert ca.read_bytes() == content
try: Path('/home/traceflow-ca-fixture/ca.pem').read_bytes()
except PermissionError: pass
else: raise AssertionError('ProtectHome ineffective')
assert 'NoNewPrivs:\\t1' in Path('/proc/self/status').read_text()
print(json.dumps({'probe':'OCI061_CA_SANDBOX','role':sys.argv[1],'readable':True,'writable':False,'protectHome':True,'nonRoot':True,'noNewPrivileges':True}))
''')
        probe.chmod(0o644)
        for unit, role in zip(units, ['api', 'worker']):
            original = (repo / 'deploy/systemd' / unit).read_text()
            # Change only test entry point/environment/lifecycle, never sandbox directives.
            lines = [line for line in original.splitlines() if not line.startswith(('EnvironmentFile=', 'ExecStartPre=', 'ExecStart=', 'WorkingDirectory=', 'Type=', 'Restart='))]
            text = '\n'.join(lines).replace('[Service]', '[Service]\nType=oneshot\nRestart=no\nWorkingDirectory='+str(public)+'\nExecStart=/usr/bin/python3 '+str(probe)+' '+role+'\nIPAddressDeny=any\nIPAddressAllow=localhost') + '\n'
            (Path('/etc/systemd/system') / unit).write_text(text)
        command(['restorecon', '/etc/systemd/system/traceflow-api.service', '/etc/systemd/system/traceflow-github-worker.service', str(probe)])
        command(['systemd-analyze', 'verify', *units]); command(['systemctl', 'daemon-reload'])
        for unit in units:
            command(['systemctl', 'start', unit])
            state = command(['systemctl', 'show', unit, '-p', 'Result', '-p', 'ExecMainStatus', '-p', 'User', '-p', 'Group', '-p', 'ProtectHome', '-p', 'ProtectSystem', '-p', 'NoNewPrivileges', '-p', 'UMask'])
            assert 'Result=success' in state and 'ExecMainStatus=0' in state
            journal = command(['journalctl', '-u', unit, '-o', 'cat', '--no-pager'])
            events = [json.loads(line) for line in journal.splitlines() if line.startswith('{')]
            assert events and events[-1]['probe'] == 'OCI061_CA_SANDBOX'
            report['checks'].append({'name': unit, 'status': 'PASS', 'state': state.splitlines(), 'probe': events[-1]})
        report.update(status='PASS', selinux=command(['getenforce']), caContext=command(['ls', '-Zd', str(target)]))
    finally:
        for unit in units: subprocess.run(['systemctl', 'stop', unit], capture_output=True)
        shutil.rmtree(private)
        report['syntheticPrivateFilesRemoved'] = not private.exists()
        (repo / 'public-result.json').write_text(json.dumps(report, indent=2))
        print(json.dumps({'status': report.get('status', 'FAIL'), 'report': str(repo / 'public-result.json')}))

if __name__ == '__main__': main()
