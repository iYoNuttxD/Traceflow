#!/usr/bin/env python3
"""Extracted package on a new empty synthetic MySQL. Never accepts an external database URL."""
import argparse
import copy
import datetime as dt
import json
import os
from pathlib import Path
import platform
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
sys.dont_write_bytecode = True
from persistence_lab import Lab
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
from diagnostic_contract import extract


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for key in ('mysql-base', 'node', 'artifact-directory', 'report'): p.add_argument('--' + key, required=True)
    a = p.parse_args()
    assert platform.system() == 'Linux' and platform.machine() == 'aarch64'
    assert 'release 9.8' in Path('/etc/oracle-release').read_text()
    assert subprocess.check_output(['getenforce']).strip() == b'Enforcing'
    os.umask(0o077)
    repo = Path(__file__).resolve().parents[2]
    root = Path(tempfile.mkdtemp(prefix='tf061-diagnostic-'))
    lab = Lab(root, a.mysql_base, '26.7.0', repo, a.node, None)
    report = {'origin': 'executed-local', 'environment': 'disposable Oracle Linux 9.8 ARM64',
              'checkedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'checks': [],
              'managedExecution': False, 'schemaMigrations': 0, 'selinux': 'Enforcing'}
    def record(name, value):
        report['checks'].append({'name': name, 'status': 'PASS', 'result': value})
        print(json.dumps({'name': name, 'status': 'PASS'}), flush=True)
    try:
        artifact = Path(a.artifact_directory)
        receipt = json.loads((artifact / 'artifact.json').read_text())
        installed = root / 'installed'
        extract(artifact / receipt['file'], receipt['sha256'], receipt['manifestSha256'], installed)
        report['package'] = receipt
        lab.start()
        original_args = list(lab.args)
        auth = {'formatVersion': 1, 'operation': 'diagnose-read-only', 'mode': 'local-isolated',
                'role': 'diagnostic', 'expiresAt': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)).isoformat(),
                'target': {'host': '127.0.0.1', 'port': lab.port, 'schema': lab.schema,
                           'user': lab.credentials['diagnostic'][0], 'serverUuid': lab.uuid,
                           'version': '26.7.0', 'datadir': str(lab.root / 'data')}}
        authorization = root / 'authorization.json'; credential = root / 'credential.json'
        Lab.write_json(authorization, auth)
        Lab.write_json(credential, {'password': lab.credentials['diagnostic'][1]})
        (root / '.env').write_text('DATABASE_URL=refuse_synthetic_dotenv_discovery\n')
        common = [a.node, str(installed / 'deploy/scripts/diagnostic-launcher.mjs'),
                  '--authorization', str(authorization), '--credential-file', str(credential),
                  '--manifest-sha256', receipt['manifestSha256'], '--ca-file', str(lab.root / 'ca.pem')]
        def call(args=None, env=None, success=True, code=None):
            start = time.monotonic()
            result = subprocess.run(args or common, env=env or lab.env, cwd=root, capture_output=True, timeout=40)
            for _, password in lab.credentials.values():
                assert password.encode() not in result.stdout + result.stderr, 'SYNTHETIC_SECRET_IN_OUTPUT'
            assert b'mysql://' not in result.stdout + result.stderr, 'URL_IN_OUTPUT'
            assert result.returncode == (0 if success else 1), 'UNEXPECTED_EXIT'
            value = json.loads(result.stdout)
            assert value['status'] in (('PASS', 'CONFIG_VALID') if success else ('FAIL',)), 'UNEXPECTED_STATUS'
            if code: assert value['code'] == code, 'UNEXPECTED_CODE_' + value.get('code', '')
            value['durationSeconds'] = round(time.monotonic() - start, 3)
            return value
        def refused(name, mutation=None, code=None, env=None):
            candidate = copy.deepcopy(auth)
            if mutation: mutation(candidate)
            Lab.write_json(authorization, candidate)
            record(name, call(env=env, success=False, code=code))
            Lab.write_json(authorization, auth)
        def canonical(url, **options):
            return call([a.node, str(installed / 'backend/scripts/validate-oci-heatwave-connection.js'),
                         '--authorization', str(authorization)], dict(lab.env, TEST_DATABASE_URL=url), **options)
        def table_count():
            return int(lab.sql('diagnostic', 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()').strip())
        def wait_socket():
            until = time.monotonic() + 30
            while time.monotonic() < until:
                if lab.process.poll() is not None: raise RuntimeError('SYNTHETIC_SERVER_EXITED')
                try:
                    with socket.create_connection(('127.0.0.1', lab.port), timeout=.2): return
                except OSError: time.sleep(.1)
            raise RuntimeError('SYNTHETIC_SERVER_TIMEOUT')
        def bootstrap(sql):
            lab.stop()
            script = lab.root / 'private/adverse-init.sql'
            script.write_text(sql); script.chmod(0o600)
            lab.process = subprocess.Popen(lab.args + ['--init-file=' + str(script)], env=lab.env,
                                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try: lab.wait_ready()
            finally: script.unlink(missing_ok=True)
        assert table_count() == 0
        record('P01-P09-native-package', json.loads(lab.command([a.node, installed / 'deploy/scripts/diagnostic-runtime.mjs'])))
        record('validate-only-no-connection', call([*common, '--validate-only']))
        for i in range(2):
            value = call()
            assert value['writes'] is False and value['disconnected'] is True
            assert value['pool'] == {'connectionLimit': 1, 'connectTimeout': 5, 'poolTimeout': 5, 'socketTimeout': 10}
            assert value['grants'] == ['SELECT'] and value['tlsSession']['Ssl_version'] in ('TLSv1.2', 'TLSv1.3')
            record('T01-T18-empty-schema-' + str(i + 1), value)
        # Reuse existing Prisma probes; only relocate the module resolution to this package.
        probe = root / 'connection-probes.mjs'
        text = (repo / 'deploy/tests/connection-probes.mjs').read_text().replace(
            'from "@prisma/client"', 'from ' + json.dumps(str(installed / 'backend/node_modules/@prisma/client/default.js')))
        probe.write_text(text)
        identity = root / 'identity.json'; Lab.write_json(identity, dict(auth['target'], mode='local-isolated'))
        probe_env = dict(lab.env, TEST_DATABASE_URL=lab.url('diagnostic'), TF06_IDENTITY=str(identity))
        record('real-prisma-authentication-dns-pool-timeouts-disconnect',
               json.loads(lab.command([a.node, probe], env=probe_env, timeout=90)))
        for name, key in [('N17-inherited-database','DATABASE_URL'), ('N18-inherited-test','TEST_DATABASE_URL'),
                          ('N19-inherited-migration','MIGRATION_DATABASE_URL'),
                          ('N05-tls-bypass-environment','NODE_TLS_REJECT_UNAUTHORIZED')]:
            refused(name, env=dict(lab.env, **{key: 'synthetic-refuse'}), code='INHERITED_ENVIRONMENT_REFUSED')
        refused('N08-uuid', lambda v: v['target'].update(serverUuid='00000000-0000-0000-0000-000000000000'), 'SERVER_IDENTITY_MISMATCH')
        refused('N09-version', lambda v: v['target'].update(version='unexpected'), 'SERVER_IDENTITY_MISMATCH')
        refused('N10-N26-dev-schema', lambda v: v['target'].update(schema='traceflow_dev'), 'PROTECTED_DATABASE_TARGET')
        refused('N11-admin-user', lambda v: v['target'].update(user='root'), 'TARGET_MISMATCH')
        refused('N13-expired', lambda v: v.update(expiresAt='2000-01-01T00:00:00Z'), 'AUTHORIZATION_EXPIRED')
        refused('N28-migration-operation', lambda v: v.update(operation='migrate'), 'READ_ONLY_REQUIRED')
        managed = copy.deepcopy(auth); managed.update(mode='oci-read-only', approved=False)
        managed['target'].update(host='traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com',
            expectedAddress='10.20.2.25', port=3306, schema='traceflow', user='traceflow_diag', caSha256='a' * 64)
        managed['target'].pop('datadir')
        Lab.write_json(authorization, managed)
        # Refused before CA access, DNS or network; never a valid managed authorization.
        record('N27-managed-no-approval', call(success=False, code='REMOTE_APPROVAL_REQUIRED'))
        Lab.write_json(authorization, auth); authorization.unlink()
        record('N14-authorization-absent', call(success=False)); Lab.write_json(authorization, auth)
        for file in (authorization, credential):
            file.chmod(0o644)
            record('N15-permissions-' + file.stem, call(success=False, code='PRIVATE_FILE_REQUIRED'))
            file.chmod(0o600)
            saved = root / (file.name + '.saved'); file.rename(saved); file.symlink_to(saved)
            record('N16-symlink-' + file.stem, call(success=False, code='UNSAFE_FILE'))
            file.unlink(); saved.rename(file)
        Lab.write_json(credential, {'password': secrets.token_hex(32)})
        record('N06-invalid-password', call(success=False))
        Lab.write_json(credential, {'password': lab.credentials['diagnostic'][1]})
        user = lab.credentials['diagnostic'][0]
        bootstrap("ALTER USER '" + user + "'@'127.0.0.1' ACCOUNT LOCK;")
        record('N07-locked-account', call(success=False))
        bootstrap("ALTER USER '" + user + "'@'127.0.0.1' ACCOUNT UNLOCK;")
        record('synthetic-account-recovered', call())
        for name, transform, expected in [
            ('N05-permissive-tls', lambda q: [('sslaccept','accept_invalid_certs') if k == 'sslaccept' else (k,v) for k,v in q], 'STRICT_TLS_REQUIRED'),
            ('N20-duplicate-option', lambda q: q + [('sslaccept','strict')], 'UNREVIEWED_CONNECTION_OPTION')]:
            u = urlsplit(lab.url('diagnostic'))
            url = urlunsplit((u.scheme,u.netloc,u.path,urlencode(transform(parse_qsl(u.query))),''))
            record(name, canonical(url, success=False, code=expected))
        for name, path in [
            ('N21-wrong-engine', installed / 'backend/node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node'),
            ('N22-missing-dependency', installed / 'backend/node_modules/dotenv/lib/main.js')]:
            original = path.read_bytes()
            if name.startswith('N21'):
                data = bytearray(original); data[18:20] = (62).to_bytes(2,'little'); path.write_bytes(data)
            else: path.unlink()
            record(name, call(success=False, code='PACKAGE_INTEGRITY_FAILED'))
            path.write_bytes(original); path.chmod(0o644)
        bootstrap("CREATE ROLE 'public'@'%'; SET GLOBAL mandatory_roles='public';")
        value = call()
        assert value['roleVerification']['mandatoryPublic'] and value['roleVerification']['expanded']
        record('mandatory-public-empty-effective-rights', value)
        lab.args = original_args + ['--mandatory-roles=public']
        bootstrap("GRANT INSERT ON " + chr(96) + lab.schema + chr(96) + ".* TO 'public'@'%';")
        record('mandatory-public-dml-refused', call(success=False, code='EXCESSIVE_OR_UNRESOLVED_GRANTS'))
        bootstrap("REVOKE INSERT ON " + chr(96) + lab.schema + chr(96) + ".* FROM 'public'@'%';")
        record('mandatory-public-recovery', call())
        lab.args = original_args; lab.restart()
        original = (lab.root / 'server.pem').read_bytes()
        for kind in ('unknown-ca', 'wrong-san', 'expired'):
            args = list(common)
            if kind == 'unknown-ca':
                ca = root / 'other-ca.pem'
                lab.command(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',root/'other.key',
                             '-out',ca,'-days','1','-subj','/CN=Synthetic other CA',
                             '-addext','basicConstraints=critical,CA:TRUE'])
                args[-1] = str(ca)
            else:
                lab.stop()
                ext = root/'server.ext'
                ext.write_text('subjectAltName=IP:' + ('127.0.0.2' if kind=='wrong-san' else '127.0.0.1') + '\nextendedKeyUsage=serverAuth\n')
                if kind == 'wrong-san':
                    lab.command(['openssl','x509','-req','-in',lab.root/'private/server.csr','-CA',lab.root/'ca.pem',
                        '-CAkey',lab.root/'private/ca.key','-CAcreateserial','-out',lab.root/'server.pem','-days','1','-extfile',ext])
                else:
                    (root/'index.txt').write_text(''); (root/'serial').write_text('1000\n')
                    config = root/'ca.cnf'
                    config.write_text('[ca]\ndefault_ca=local\n[local]\ndatabase='+str(root/'index.txt')+'\nserial='+str(root/'serial')+
                        '\nnew_certs_dir='+str(root)+'\ncertificate='+str(lab.root/'ca.pem')+'\nprivate_key='+str(lab.root/'private/ca.key')+
                        '\ndefault_md=sha256\ndefault_days=1\npolicy=policy\n[policy]\ncommonName=supplied\n')
                    lab.command(['openssl','ca','-batch','-notext','-config',config,'-in',lab.root/'private/server.csr',
                        '-out',lab.root/'server.pem','-startdate','20200101000000Z','-enddate','20200102000000Z','-extfile',ext])
                lab.process = subprocess.Popen(lab.args,env=lab.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                wait_socket()
            value = call(args, success=False)
            assert value['code'] not in ('TLS_TIMEOUT','DIAGNOSTIC_FAILED')
            record({'unknown-ca':'N01','expired':'N02','wrong-san':'N03'}[kind] + '-' + kind, value)
        lab.stop(); (lab.root/'server.pem').write_bytes(original); lab.restart()
        assert table_count() == 0; report['emptySchemaBeforeAndAfter'] = True
        record('recovery-empty-schema-no-migrations-ddl-dml', call())
        assert len(lab.sql('diagnostic','SHOW PROCESSLIST').decode().strip().splitlines()) == 1
        record('T11-no-remaining-diagnostic-sessions', {'sessionsBeforeObserver': 0})
        lab.stop()
        plain = [x for x in original_args if not x.startswith(('--ssl-','--require-secure-transport='))] + ['--tls-version=','--require-secure-transport=OFF']
        lab.process = subprocess.Popen(plain,env=lab.env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        wait_socket()
        record('N04-no-tls', call(success=False, code='TLS_REQUIRED'))
        lab.stop(); record('N23-unavailable', call(success=False, code='ECONNREFUSED'))
        server = socket.socket()
        for _ in range(100):
            port = 49152 + secrets.randbelow(16384)
            try: server.bind(('127.0.0.1', port)); break
            except OSError: continue
        else: raise RuntimeError('NO_OWNED_TIMEOUT_PORT')
        server.listen(1)
        timed_auth = copy.deepcopy(auth); timed_auth['target']['port'] = port
        Lab.write_json(authorization, timed_auth)
        def stall():
            conn, _ = server.accept()
            with conn:
                try: conn.recv(1)
                except OSError: pass
        thread = threading.Thread(target=stall, daemon=True); thread.start()
        try:
            value = call(success=False, code='TLS_TIMEOUT')
            assert 4.8 <= value['durationSeconds'] < 12
            record('N24-timeout', value)
        finally:
            server.close(); thread.join(2)
        report['status'] = 'PASS'
    except Exception as exc:
        report['status'] = 'FAIL'; report['code'] = type(exc).__name__ + ':' + str(exc)
    finally:
        lab.cleanup(); shutil.rmtree(root)
        report['syntheticResourcesRemoved'] = not root.exists()
        Path(a.report).write_text(json.dumps(report, indent=2))
        print(json.dumps({'status': report['status'], 'code': report.get('code'), 'report': a.report}), flush=True)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
