#!/usr/bin/env python3
"""Prepare a pinned public MySQL root CA. Plan by default; no replacement or global trust.

Only /etc/pki/traceflow/mysql-ca.pem is managed. --root is exclusively for an
owned temporary fixture marked like prepare-runtime-directories.py. No network,
private key, service operation, recursive permission change or SELinux disable.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import tempfile
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
from release_contract import require, trusted_path, Refused


def certificate(source, expected):
    require(bool(re.fullmatch(r'[a-fA-F0-9]{64}', expected)), 'EXPECTED_CA_FINGERPRINT_REQUIRED')
    trusted_path(source)
    fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_size <= 65536, 'PUBLIC_CA_FILE_REQUIRED')
        data = os.read(fd, 65537)
    finally:
        os.close(fd)
    require(bool(re.fullmatch(rb'\s*-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*', data)), 'SINGLE_PUBLIC_CA_REQUIRED')
    environment = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C'}
    def openssl(args, content=None):
        process = subprocess.run(['openssl', *args], input=content, env=environment,
                                 capture_output=True, timeout=5)
        require(process.returncode == 0, 'CA_VALIDATION_FAILED')
        return process.stdout
    der = openssl(['x509', '-outform', 'DER'], data)
    digest = hashlib.sha256(der).hexdigest()
    require(digest == expected.lower(), 'CA_FINGERPRINT_MISMATCH')
    require(b'CA:TRUE' in openssl(['x509', '-noout', '-text'], data), 'ROOT_CA_REQUIRED')
    # Validate exactly the pinned bytes, not a second read of the operator's path.
    with tempfile.TemporaryDirectory(prefix='traceflow-public-ca-') as temp:
        candidate = Path(temp) / 'ca.pem'; candidate.write_bytes(data); candidate.chmod(0o600)
        openssl(['verify', '-check_ss_sig', '-CAfile', str(candidate), str(candidate)])
    return data, digest


def prepare(root, source, expected, apply=False):
    require(root.is_absolute() and root == Path(os.path.realpath(root)), 'CANONICAL_ROOT_REQUIRED')
    trusted_path(root, directory=True, uid=os.geteuid())
    if root == Path('/'):
        require(sys.platform == 'linux' and os.geteuid() == 0, 'LINUX_ROOT_REQUIRED')
        require(pwd.getpwnam('traceflow').pw_uid != 0, 'SERVICE_IDENTITY_REQUIRED')
    else:
        require(Path(tempfile.gettempdir()).resolve() in root.parents and not root.stat().st_mode & 0o077, 'PRIVATE_TEMP_ROOT_REQUIRED')
        trusted_path(root / '.traceflow-runtime-test', uid=os.geteuid())
    parent = root / 'etc/pki'; trusted_path(parent, directory=True, uid=os.geteuid())
    for path in [parent, *parent.parents]:
        require(path.stat().st_uid in (0, os.geteuid()), 'UNTRUSTED_PARENT_OWNER')
        if path == root: break
    directory = parent / 'traceflow'; destination = directory / 'mysql-ca.pem'
    if directory.exists() or directory.is_symlink():
        trusted_path(directory, directory=True, uid=os.geteuid())
        require(stat.S_IMODE(directory.stat().st_mode) == 0o755, 'CA_DIRECTORY_MODE')
    data, digest = certificate(source, expected)
    result = {'destination': str(destination), 'sha256Der': digest, 'globalTrustChanged': False,
              'serviceRestarted': False, 'selinux': 'RESTORECON_REQUIRED_BEFORE_USE'}
    if destination.exists() or destination.is_symlink():
        trusted_path(destination, uid=os.geteuid())
        require(stat.S_IMODE(destination.stat().st_mode) in (0o444, 0o644), 'CA_FILE_MODE')
        existing, _ = certificate(destination, expected)
        require(existing == data, 'EXISTING_CA_DIFFERS_REVIEW_REQUIRED')
        return dict(result, status='UNCHANGED', created=False)
    if not apply:
        return dict(result, status='PLAN', created=False)
    if not directory.exists(): directory.mkdir(mode=0o755); directory.chmod(0o755)
    # Trusted installer-owned parents, exclusive publication, never overwrite.
    fd, temporary = tempfile.mkstemp(prefix='.mysql-ca-', dir=directory)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(data); output.flush(); os.fchmod(output.fileno(), 0o644); os.fsync(output.fileno())
        os.link(temporary, destination, follow_symlinks=False)
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
    finally:
        os.unlink(temporary)
    return dict(result, status='CREATED', created=True, inode=destination.stat().st_ino)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('/'))
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.root, args.source, args.expected_sha256, args.apply)))
    except (OSError, ValueError, KeyError, Refused, subprocess.SubprocessError):
        sys.exit('CA_PREPARATION_REFUSED: verify public certificate, fingerprint, ownership and paths')
