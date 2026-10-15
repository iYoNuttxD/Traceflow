#!/usr/bin/env python3
"""Full quality gates in an explicitly disposable OL ARM64 VM; never accepts database URLs."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
sys.dont_write_bytecode = True
from persistence_lab import Lab


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for key in ('mysql-base', 'node', 'report'): p.add_argument('--' + key, required=True)
    p.add_argument('--backend-coverage-only', action='store_true', help='Rerun only backend coverage in a fresh owned MySQL; requires dependencies already installed')
    a = p.parse_args()
    assert platform.system() == 'Linux' and platform.machine() == 'aarch64'
    assert 'release 9.8' in Path('/etc/oracle-release').read_text()
    assert subprocess.check_output(['getenforce']).strip() == b'Enforcing'
    repo = Path(__file__).resolve().parents[2]
    assert not (repo / 'backend/.env').exists() and not (repo / 'frontend/.env').exists()
    os.umask(0o077)
    root = Path(tempfile.mkdtemp(prefix='tf061-quality-'))
    lab = Lab(root, a.mysql_base, '26.7.0', repo, a.node, None)
    report = {'origin': 'executed-local', 'environment': 'disposable Oracle Linux 9.8 ARM64',
              'checkedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'checks': [],
              'managedExecution': False, 'migrationsAuthorization': 'user: disposable laboratory only'}
    environment = dict(lab.env, NPM_CONFIG_CACHE=str(root / 'cache'),
                       NPM_CONFIG_USERCONFIG=str(root / 'npmrc'), NPM_CONFIG_GLOBALCONFIG=str(root / 'global-npmrc'),
                       PRISMA_SKIP_POSTINSTALL_GENERATE='true', PRISMA_HIDE_UPDATE_MESSAGE='1', CHECKPOINT_DISABLE='1')
    (root / 'npmrc').touch(); (root / 'global-npmrc').touch()
    def gate(name, args, cwd, env=None, timeout=900):
        print(json.dumps({'phase': name}), flush=True)
        started = time.monotonic()
        try:
            r = subprocess.run(args, cwd=cwd, env=env or environment, capture_output=True, timeout=timeout)
            text = (r.stdout + r.stderr).decode(errors='replace')
            text = re.sub(r'mysql://[^\s"\']+', '[REDACTED_DATABASE_URL]', text)
            for _, password in lab.credentials.values(): text = text.replace(password, '[REDACTED_SYNTHETIC]')
            text = text.replace(str(root), '<OWNED_LAB>')
            text = re.sub(r'\x1b\[[0-9;]*m', '', text)
            (root / (name + '.log')).write_text(text)
            record = {'name': name, 'command': args, 'exitCode': r.returncode,
                      'seconds': round(time.monotonic() - started, 2),
                      'status': 'PASS' if r.returncode == 0 else 'FAIL',
                      'summary': text[-7000:] if r.returncode else text[-1500:],
                      'testSummary': [line.strip() for line in text.splitlines() if re.match(r'\s*(Test Files|Tests |Errors |Duration |All files)', line)]}
        except subprocess.TimeoutExpired:
            record = {'name': name, 'command': args, 'status': 'FAIL', 'code': 'GATE_TIMEOUT'}
        report['checks'].append(record)
        Path(a.report).write_text(json.dumps(report, indent=2))
        print(json.dumps({k: record[k] for k in ('name', 'status')}), flush=True)
        return record['status'] == 'PASS'
    try:
        for project in (() if a.backend_coverage_only else ('backend', 'frontend')):
            if not gate(project + '-npm-ci', ['npm', 'ci', '--no-audit', '--no-fund'], repo / project):
                raise RuntimeError('DEPENDENCY_INSTALL_FAILED')
        # Diagnostic laboratory uses its own empty instance; this instance is exclusively for the full suite.
        lab.start()
        assert lab.sql('diagnostic', 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()').strip() == b'0'
        # Full concurrency tests need multiple connections. Do not reuse the diagnostic pool=1.
        source = urlsplit(lab.url('migration'))
        query = dict(parse_qsl(source.query)); query['connection_limit'] = '5'
        test_url = urlunsplit((source.scheme, source.netloc, source.path, urlencode(query), ''))
        report['backendTestPool'] = 5
        tests_env = dict(environment, NODE_ENV='test', TEST_DATABASE_URL=test_url,
                         DATABASE_URL='mysql://127.0.0.1:1/unused_quality_guard')
        prisma_env = dict(environment, DATABASE_URL=lab.url('migration'))
        if a.backend_coverage_only:
            gate('backend-coverage', ['npm', 'run', 'test:coverage'], repo / 'backend', tests_env, timeout=1800)
            report['syntheticMigrations'] = int(lab.sql('migration', 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL').strip())
            coverage = repo / 'backend/coverage/coverage-summary.json'
            if coverage.exists(): report['backendCoverage'] = json.loads(coverage.read_text())['total']
            report['status'] = 'PASS' if all(c['status'] == 'PASS' for c in report['checks']) else 'FAIL'
            return 0 if report['status'] == 'PASS' else 1
        for operation in ('validate', 'generate'):
            gate('prisma-' + operation, [a.node, 'node_modules/prisma/build/index.js', operation],
                 repo / 'backend', prisma_env)
        for project in ('backend', 'frontend'):
            for command in ('lint', 'format:check'):
                gate(project + '-' + command.replace(':', '-'), ['npm', 'run', command], repo / project)
        gate('architecture', ['npm', 'run', 'architecture:check'], repo / 'backend')
        gate('ci-format', [a.node, 'backend/node_modules/prettier/bin/prettier.cjs', '--check',
             '.github/workflows/ci.yml', 'scripts/*.mjs', 'docs/security/npm-audit-exceptions.json',
             'deploy/scripts/diagnostic-*.mjs', 'deploy/tests/diagnostic-launcher.test.mjs'], repo)
        gate('ci-policy', [a.node, '--test', 'scripts/validate-ci.test.mjs', 'scripts/check-npm-audit.test.mjs',
                          'scripts/check-ui-inventory.test.mjs'], repo)
        gate('diagnostic-artifact-tests', ['/usr/bin/python3', '-B', '-m', 'unittest', 'discover',
                                        '-s', 'deploy/tests', '-p', 'test_diagnostic_package.py', '-v'], repo)
        gate('diagnostic-output-tests', [a.node, '--test', 'deploy/tests/diagnostic-launcher.test.mjs'], repo)
        for project in ('backend', 'frontend'):
            gate(project + '-audit-policy', [a.node, 'scripts/check-npm-audit.mjs', project,
                                             'docs/security/npm-audit-exceptions.json'], repo, timeout=180)
            audit = subprocess.run(['npm', 'audit', '--json'], cwd=repo / project, env=environment, capture_output=True, timeout=180)
            data = json.loads(audit.stdout)
            report[project + 'Audit'] = {'totals': data['metadata']['vulnerabilities'], 'exitCode': audit.returncode}
        gate('backend-coverage', ['npm', 'run', 'test:coverage'], repo / 'backend', tests_env, timeout=1800)
        report['syntheticMigrations'] = int(lab.sql('migration',
            'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL').strip())
        gate('frontend-coverage', ['npm', 'run', 'test:coverage'], repo / 'frontend', timeout=1800)
        gate('frontend-build', ['npm', 'run', 'build'], repo / 'frontend')
        for project in ('backend', 'frontend'):
            coverage = repo / project / 'coverage/coverage-summary.json'
            if coverage.exists(): report[project + 'Coverage'] = json.loads(coverage.read_text())['total']
        report['status'] = 'PASS' if all(c['status'] == 'PASS' for c in report['checks']) else 'FAIL'
    except Exception as exc:
        report['status'] = 'FAIL'; report['code'] = type(exc).__name__
    finally:
        lab.cleanup()
        shutil.rmtree(root)
        report['syntheticResourcesRemoved'] = not root.exists()
        Path(a.report).write_text(json.dumps(report, indent=2))
        print(json.dumps({'status': report['status'], 'report': a.report}), flush=True)
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
