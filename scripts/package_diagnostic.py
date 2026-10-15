#!/usr/bin/env python3
"""Export only diagnostic inputs from the working tree; build only in native OL9.8 ARM64."""
import argparse
import contextlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'deploy/lib'))
from diagnostic_contract import (SOURCES, DRIVERS, DEPENDENCIES, ENGINE, Refused, require,
                                 encoded, digest, file_digest, trusted, pack, extract)

RECIPES = ('scripts/package-diagnostic.mjs', 'scripts/package_diagnostic.py',
           'deploy/lib/diagnostic_contract.py', *DRIVERS)
INPUTS = tuple(dict.fromkeys((*SOURCES, *RECIPES, 'backend/package.json', 'backend/package-lock.json')))


def command(args, cwd=None, env=None, timeout=900):
    result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, timeout=timeout)
    require(result.returncode == 0, 'COMMAND_FAILED_' + Path(args[0]).name)
    return result.stdout


def export(args):
    destination = Path(os.path.abspath(args.output))
    trusted(destination.parent, directory=True)
    require(not destination.exists(), 'OUTPUT_EXISTS')
    head = command(['git', 'rev-parse', 'HEAD'], ROOT).decode().strip()
    branch = command(['git', 'branch', '--show-current'], ROOT).decode().strip()
    require(re.fullmatch('[a-f0-9]{40}', head), 'HEAD_REQUIRED')
    changes = []
    content = {}
    for name in INPUTS:
        path = trusted(ROOT / name)
        data = path.read_bytes()
        old = subprocess.run(['git', 'show', head + ':' + name], cwd=ROOT, capture_output=True)
        state = 'untracked' if old.returncode else 'modified' if old.stdout != data else 'unchanged'
        if state != 'unchanged':
            changes.append({'path': name, 'state': state})
        content[name] = data
    # Never enumerate/read .env, existing node_modules or arbitrary untracked payloads.
    files = {name: {'sha256': digest(data), 'size': len(data)} for name, data in content.items()}
    proof = {'formatVersion': 1, 'kind': 'diagnostic-source', 'head': head, 'branch': branch,
             'sourceState': 'working-tree-candidate', 'files': files, 'includedLocalChanges': changes}
    destination.mkdir(mode=0o700)
    for name, data in content.items():
        path = destination / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod(0o644)
    (destination / 'source.json').write_bytes(encoded(proof))
    (destination / 'source.json').chmod(0o644)
    print(json.dumps({'status': 'EXPORTED', 'sourceSha256': file_digest(destination / 'source.json'),
                      'head': head, 'includedLocalChanges': changes, 'files': len(files)}))


@contextlib.contextmanager
def workspace(identity):
    path = Path('/tmp') / ('traceflow-diagnostic-build-' + identity)
    require(not path.exists() and not path.is_symlink(), 'BUILD_WORKSPACE_EXISTS')
    path.mkdir(mode=0o700)
    owner = (path.stat().st_ino, path.stat().st_uid)
    try:
        yield path
    finally:
        require(not path.is_symlink() and (path.stat().st_ino, path.stat().st_uid) == owner, 'BUILD_CLEANUP_OWNER')
        shutil.rmtree(path)


def build(args):
    require(platform.system() == 'Linux' and platform.machine() in ('aarch64', 'arm64'), 'LINUX_ARM64_REQUIRED')
    require('Oracle Linux Server release 9.8' in Path('/etc/oracle-release').read_text(), 'ORACLE98_REQUIRED')
    source = trusted(args.source, directory=True)
    proof_path = trusted(source / 'source.json')
    require(file_digest(proof_path) == args.source_sha256, 'SOURCE_TRUST')
    proof = json.loads(proof_path.read_bytes())
    require(set(proof['files']) == set(INPUTS), 'SOURCE_ALLOWLIST')
    actual = {p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_file()}
    require(actual == {*INPUTS, 'source.json'} and
            not any(p.is_symlink() for p in source.rglob('*')), 'SOURCE_INVENTORY')
    for name, record in proof['files'].items():
        require(file_digest(trusted(source / name)) == record['sha256'], 'SOURCE_DIGEST')
    # The executing recipes must be the reviewed recipes in the source manifest.
    for name in RECIPES:
        require(file_digest(ROOT / name) == proof['files'][name]['sha256'], 'RECIPE_MISMATCH')
    output = Path(os.path.abspath(args.output))
    trusted(output.parent, directory=True)
    require(not output.exists(), 'OUTPUT_EXISTS')
    with workspace(args.source_sha256[:16]) as work:
        home = work / 'home'
        home.mkdir()
        user_config, global_config = work / 'npm-user', work / 'npm-global'
        user_config.touch()
        global_config.touch()
        environment = {'PATH': os.environ['PATH'], 'HOME': str(home), 'LANG': 'C.UTF-8', 'TZ': 'UTC',
                       'NPM_CONFIG_USERCONFIG': str(user_config), 'NPM_CONFIG_GLOBALCONFIG': str(global_config),
                       'NPM_CONFIG_CACHE': str(work / 'cache'), 'NPM_CONFIG_REGISTRY': 'https://registry.npmjs.org',
                       'PRISMA_SKIP_POSTINSTALL_GENERATE': 'true', 'PRISMA_HIDE_UPDATE_MESSAGE': '1',
                       'CHECKPOINT_DISABLE': '1', 'DATABASE_URL': 'mysql://127.0.0.1:1/unused_build_guard'}
        node = command(['node', '-p', 'process.versions.node'], env=environment).decode().strip()
        npm = command(['npm', '--version'], env=environment).decode().strip()
        require(node.split('.')[0] == '22', 'NODE22_REQUIRED')
        openssl = command(['openssl', 'version'], env=environment).decode().strip()
        require(openssl.startswith('OpenSSL 3.'), 'OPENSSL3_REQUIRED')
        backend = work / 'backend'
        (backend / 'prisma').mkdir(parents=True)
        for name in ('package.json', 'package-lock.json', 'prisma/schema.prisma'):
            shutil.copyfile(source / 'backend' / name, backend / name)
        lock = json.loads((backend / 'package-lock.json').read_bytes())
        require(lock['packages']['node_modules/prisma']['version'] == '6.12.0' and
                lock['packages']['node_modules/@prisma/client']['version'] == '6.12.0', 'PRISMA_VERSION')
        print(json.dumps({'phase': 'npm-ci', 'scope': 'isolated build only'}), flush=True)
        command(['npm', 'ci', '--no-audit', '--no-fund'], backend, environment)
        for operation in ('validate', 'generate'):
            command(['node', 'node_modules/prisma/build/index.js', operation, '--schema', 'prisma/schema.prisma'],
                    backend, environment)
        runtime = work / 'package'
        runtime.mkdir(mode=0o750)
        for name in (*SOURCES, *DRIVERS, *DEPENDENCIES):
            src = work / name if name in DEPENDENCIES else source / name
            require(src.is_file() and not src.is_symlink(), 'RUNTIME_INPUT_MISSING')
            dst = runtime / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            dst.chmod(0o644)
        shutil.copyfile(source / 'deploy/lib/diagnostic_contract.py', runtime / 'diagnostic-tool.py')
        (runtime / 'diagnostic-tool.py').chmod(0o644)
        thin = {'name': 'traceflow-prisma-diagnostic-runtime', 'private': True, 'type': 'module',
                'dependencies': {'@prisma/client': '6.12.0', 'dotenv': lock['packages']['node_modules/dotenv']['version']}}
        (runtime / 'backend/package.json').write_bytes(encoded(thin))
        (runtime / 'backend/package.json').chmod(0o644)
        index = (runtime / 'backend/node_modules/.prisma/client/index.js').read_text()
        env_match = re.search(r'"relativeEnvPaths"\s*:\s*(\{[^}]*\})', index)
        require(env_match is not None, 'GENERATED_ENV_DISCOVERY')
        env_paths = json.loads(env_match.group(1))
        require(set(env_paths).issubset({'rootEnvPath', 'schemaEnvPath'}) and
                all(value is None for value in env_paths.values()), 'GENERATED_ENV_DISCOVERY')
        smoke = json.loads(command(['node', str(runtime / 'deploy/scripts/diagnostic-runtime.mjs')],
                                   runtime, {'PATH': environment['PATH'], 'HOME': '/nonexistent', 'LANG': 'C.UTF-8'}))
        require(smoke['status'] == 'RUNTIME_VALID', 'RUNTIME_SMOKE')
        metadata = {'formatVersion': 1, 'kind': 'prisma-diagnostic', 'application': 'TraceFlow',
                    'productionRelease': False, 'packageId': 'traceflow-prisma-diagnostic-' + args.source_sha256[:16],
                    'head': proof['head'], 'branch': proof['branch'], 'sourceState': proof['sourceState'],
                    'sourceSha256': args.source_sha256, 'sourceFiles': proof['files'],
                    'includedLocalChanges': proof['includedLocalChanges'], 'nodeVersion': node, 'npmVersion': npm,
                    'prismaVersion': '6.12.0', 'engine': 'linux-arm64-openssl-3.0.x',
                    'dependencies': thin['dependencies'], 'openssl': openssl,
                    'platform': {'os': 'linux', 'architecture': 'arm64', 'distribution': 'Oracle Linux 9.8', 'opensslMajor': 3}}
        output.mkdir(mode=0o750)
        archive = output / (metadata['packageId'] + '.tar.gz')
        receipt = pack(runtime, archive, metadata)
        shutil.copyfile(runtime / 'manifest.json', output / 'manifest.json')
        shutil.copyfile(runtime / 'diagnostic-tool.py', output / 'diagnostic-tool.py')
        receipt.update(packageId=metadata['packageId'], verifierSha256=file_digest(output / 'diagnostic-tool.py'),
                       head=proof['head'], sourceSha256=args.source_sha256, productionRelease=False)
        (output / 'artifact.json').write_bytes(encoded(receipt))
        extracted = work / 'extracted'
        extract(archive, receipt['sha256'], receipt['manifestSha256'], extracted)
        command(['node', str(extracted / 'deploy/scripts/diagnostic-runtime.mjs')], extracted,
                {'PATH': environment['PATH'], 'HOME': '/nonexistent', 'LANG': 'C.UTF-8'})
        print(json.dumps({'status': 'BUILT', **receipt}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    e = sub.add_parser('export')
    e.add_argument('--output', required=True)
    b = sub.add_parser('build')
    b.add_argument('--source', required=True)
    b.add_argument('--source-sha256', required=True)
    b.add_argument('--output', required=True)
    args = parser.parse_args()
    export(args) if args.action == 'export' else build(args)


if __name__ == '__main__':
    try:
        main()
    except (Refused, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as exc:
        print(json.dumps({'status': 'REFUSED', 'code': str(exc) if isinstance(exc, Refused) else type(exc).__name__}))
        sys.exit(1)
