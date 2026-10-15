"""Diagnostic-only format v1: pinned manifest, exact allowlist and safe extraction.

Independent of application releases: no database credentials, migrations or service actions.
Also shipped verbatim as diagnostic-tool.py for offline verify/extract before running Node.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tarfile
sys.dont_write_bytecode = True

ENGINE = 'libquery_engine-linux-arm64-openssl-3.0.x.so.node'
SOURCES = (
    'backend/scripts/validate-oci-heatwave-connection.js',
    'backend/scripts/lib/heatwave-connection.js',
    'backend/scripts/lib/oci-compatibility-safety.js',
    'backend/scripts/lib/database-safety.js',
    'backend/src/database/prismaClient.js',
    'backend/src/database/database-safety.js',
    'backend/prisma/schema.prisma',
)
DRIVERS = ('deploy/scripts/diagnostic-launcher.mjs', 'deploy/scripts/diagnostic-runtime.mjs')
DEPENDENCIES = tuple('backend/node_modules/' + name for name in (
    '@prisma/client/default.js', '@prisma/client/index.js', '@prisma/client/package.json',
    '@prisma/client/LICENSE', '@prisma/client/runtime/library.js',
    '.prisma/client/default.js', '.prisma/client/index.js', '.prisma/client/package.json',
    '.prisma/client/schema.prisma', '.prisma/client/' + ENGINE,
    'dotenv/lib/main.js', 'dotenv/package.json', 'dotenv/LICENSE',
))
FILES = frozenset((*SOURCES, *DRIVERS, *DEPENDENCIES, 'backend/package.json', 'diagnostic-tool.py'))
MAX_SIZE = 128 * 1024 * 1024


class Refused(RuntimeError):
    pass


def require(value, code):
    if not value:
        raise Refused(code)


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def file_digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else digest(stream.read())


def safe_path(value):
    require(isinstance(value, str), 'MEMBER_PATH')
    p = PurePosixPath(value)
    require(value and not p.is_absolute() and str(p) == value and
            all(x not in ('', '.', '..') for x in p.parts) and '\\' not in value and
            not any(ord(c) < 32 for c in value), 'MEMBER_PATH')
    return value


def trusted(path, directory=False):
    path = Path(os.path.abspath(path))
    require(str(path) == os.path.realpath(path), 'PATH_SYMLINK')
    for parent in [*reversed(path.parents), path]:
        st = parent.lstat()
        require(st.st_uid in (0, os.geteuid()), 'PATH_OWNER')
        require(not st.st_mode & 0o022 or
                (parent != path and st.st_uid == 0 and st.st_mode & stat.S_ISVTX), 'PATH_WRITABLE')
        require(stat.S_ISDIR(st.st_mode) if parent != path or directory else
                stat.S_ISREG(st.st_mode), 'PATH_TYPE')
    return path


def scan(name, data):
    require(name in FILES, 'UNEXPECTED_FILE')
    require(not re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]{48,}|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}', data),
            'SECRET_PATTERN')
    require(not re.search(rb'mysql://[^\s/:"\x27]+:[^\s@"\x27]+@', data), 'CREDENTIAL_URL')
    if name.endswith(ENGINE):
        require(data[:5] == b'\x7fELF\x02' and data[5] == 1 and
                int.from_bytes(data[18:20], 'little') == 183, 'ENGINE_ARCHITECTURE')


def inventory(root):
    root = trusted(root, directory=True)
    expected_dirs = {str(p) for name in FILES for p in PurePosixPath(name).parents if str(p) != '.'}
    result = {}
    total = 0
    for path in sorted(root.rglob('*')):
        name = path.relative_to(root).as_posix()
        st = path.lstat()
        require(not stat.S_ISLNK(st.st_mode), 'TREE_SYMLINK')
        require(st.st_uid in (0, os.geteuid()) and not st.st_mode & 0o022, 'TREE_PERMISSIONS')
        if stat.S_ISDIR(st.st_mode):
            require(name in expected_dirs, 'UNEXPECTED_DIRECTORY')
            continue
        require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1, 'TREE_FILE_TYPE')
        require(name == 'manifest.json' or name in FILES, 'UNEXPECTED_FILE')
        require(stat.S_IMODE(st.st_mode) == 0o644 and st.st_size <= 64 * 1024 * 1024, 'TREE_FILE_MODE_SIZE')
        total += st.st_size
        require(total <= MAX_SIZE, 'TREE_SIZE')
        if name == 'manifest.json':
            continue
        data = path.read_bytes()
        scan(name, data)
        result[name] = {'sha256': digest(data), 'size': len(data), 'mode': 0o644}
    require(set(result) == FILES, 'MISSING_FILE')
    return result


def validate_manifest(value):
    require(value.get('formatVersion') == 1 and value.get('kind') == 'prisma-diagnostic' and
            value.get('application') == 'TraceFlow' and value.get('productionRelease') is False, 'MANIFEST_FORMAT')
    require(value.get('platform') == {'os': 'linux', 'architecture': 'arm64', 'distribution': 'Oracle Linux 9.8', 'opensslMajor': 3},
            'PLATFORM_MISMATCH')
    require(value.get('nodeVersion', '').split('.')[0] == '22' and value.get('prismaVersion') == '6.12.0' and
            value.get('engine') == 'linux-arm64-openssl-3.0.x', 'VERSION_MISMATCH')
    require(re.fullmatch(r'[a-f0-9]{40}', value.get('head', '')) and
            re.fullmatch(r'[a-f0-9]{64}', value.get('sourceSha256', '')) and
            re.fullmatch(r'traceflow-prisma-diagnostic-[a-f0-9]{16}', value.get('packageId', '')), 'PROVENANCE')
    require(value.get('sourceState') == 'working-tree-candidate' and
            isinstance(value.get('sourceFiles'), dict) and isinstance(value.get('includedLocalChanges'), list), 'SOURCE_STATE')
    require(set(value.get('files', {})) == FILES, 'MANIFEST_ALLOWLIST')
    total = 0
    for name, entry in value['files'].items():
        safe_path(name)
        require(re.fullmatch('[a-f0-9]{64}', entry['sha256']) and isinstance(entry['size'], int) and
                0 <= entry['size'] <= 64 * 1024 * 1024 and entry['mode'] == 0o644, 'FILE_RECORD')
        total += entry['size']
    require(total <= MAX_SIZE, 'MANIFEST_SIZE')


def verify_tree(root, expected):
    root = trusted(root, directory=True)
    require(re.fullmatch('[a-f0-9]{64}', expected or ''), 'EXPECTED_MANIFEST_REQUIRED')
    path = trusted(root / 'manifest.json')
    require(path.stat().st_size <= 1024 * 1024 and file_digest(path) == expected, 'MANIFEST_DIGEST')
    value = json.loads(path.read_bytes())
    validate_manifest(value)
    require(inventory(root) == value['files'], 'TREE_INTEGRITY')
    return value


def pack(root, output, metadata):
    manifest = dict(metadata, files=inventory(root))
    validate_manifest(manifest)
    mpath = root / 'manifest.json'
    mpath.write_bytes(encoded(manifest))
    mpath.chmod(0o644)
    with Path(output).open('xb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0, compresslevel=6) as zipped:
            with tarfile.open(fileobj=zipped, mode='w', format=tarfile.USTAR_FORMAT) as archive:
                for name in sorted([*FILES, 'manifest.json']):
                    data = (root / name).read_bytes()
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    info.mode = 0o644
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ''
                    archive.addfile(info, io.BytesIO(data))
    return {'file': Path(output).name, 'size': Path(output).stat().st_size,
            'sha256': file_digest(output), 'manifestSha256': file_digest(mpath)}


def extract(archive, expected, manifest_digest, destination):
    archive = trusted(archive)
    require(re.fullmatch('[a-f0-9]{64}', expected or '') and file_digest(archive) == expected, 'ARCHIVE_DIGEST')
    destination = Path(os.path.abspath(destination))
    trusted(destination.parent, directory=True)
    require(not destination.exists() and not destination.is_symlink(), 'DESTINATION_EXISTS')
    with tarfile.open(archive, 'r:gz') as tar:
        entries = {}
        total = 0
        for item in tar:
            safe_path(item.name)
            require(item.name in FILES or item.name == 'manifest.json', 'ARCHIVE_ALLOWLIST')
            require(item.name not in entries and item.isfile() and not item.linkname and
                    item.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and not item.sparse and
                    item.mode == 0o644 and item.size <= 64 * 1024 * 1024, 'ARCHIVE_MEMBER')
            total += item.size
            require(len(entries) < len(FILES) + 1 and total <= MAX_SIZE, 'ARCHIVE_SIZE')
            entries[item.name] = item
        require(set(entries) == {*FILES, 'manifest.json'}, 'ARCHIVE_INVENTORY')
        require(entries['manifest.json'].size <= 1024 * 1024, 'MANIFEST_SIZE')
        data = tar.extractfile(entries['manifest.json']).read()
        require(digest(data) == manifest_digest, 'MANIFEST_DIGEST')
        value = json.loads(data)
        validate_manifest(value)
        destination.mkdir(mode=0o750)
        identity = (destination.stat().st_ino, destination.stat().st_uid)
        try:
            for name, item in entries.items():
                data = tar.extractfile(item).read()
                if name != 'manifest.json':
                    rec = value['files'][name]
                    require(len(data) == rec['size'] and digest(data) == rec['sha256'], 'MEMBER_DIGEST')
                    scan(name, data)
                out = destination / name
                out.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with out.open('xb') as stream:
                    stream.write(data)
                out.chmod(0o644)
            return verify_tree(destination, manifest_digest)
        except BaseException:
            require(not destination.is_symlink() and
                    (destination.stat().st_ino, destination.stat().st_uid) == identity, 'CLEANUP_OWNER')
            shutil.rmtree(destination)
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    v = sub.add_parser('verify')
    v.add_argument('--root', required=True)
    v.add_argument('--manifest-sha256', required=True)
    x = sub.add_parser('extract')
    x.add_argument('--archive', required=True)
    x.add_argument('--sha256', required=True)
    x.add_argument('--manifest-sha256', required=True)
    x.add_argument('--destination', required=True)
    args = parser.parse_args()
    value = verify_tree(args.root, args.manifest_sha256) if args.action == 'verify' else extract(
        args.archive, args.sha256, args.manifest_sha256, args.destination)
    print(json.dumps({'status': 'VERIFIED', 'packageId': value['packageId'],
                      'files': len(value['files']), 'connected': False}))


if __name__ == '__main__':
    try:
        main()
    except (Refused, OSError, ValueError, KeyError, tarfile.TarError) as exc:
        print(json.dumps({'status': 'REFUSED', 'code': str(exc) if isinstance(exc, Refused) else type(exc).__name__}))
        sys.exit(1)
