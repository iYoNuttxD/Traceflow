#!/usr/bin/env python3
"""Prepare only the fixed runtime directory allowlist; dry-run unless --apply.

Production: root on Linux with existing traceflow user/group. Tests: an existing,
owned temporary root with marker .traceflow-runtime-test and explicit identities.
No recursive chmod/chown, deletion, environment file, current symlink or release.
"""
import argparse
import grp
import os
from pathlib import Path
import pwd
import stat
import sys
import tempfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def checked_directory(path):
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        if current.exists() or current.is_symlink():
            info = current.lstat()
            require(stat.S_ISDIR(info.st_mode), "non-directory or symlink in path")
    return path


def plan(root, uid, gid):
    # All managed parents stay owned by the installer, never by the runtime.
    owner = os.geteuid()
    group = os.getegid()
    return [(root / p, u, g, m) for p, u, g, m in [
        ("opt/traceflow", owner, group, 0o755),
        ("opt/traceflow/releases", owner, group, 0o755),
        ("opt/traceflow/shared", owner, group, 0o700),
        ("etc/traceflow", owner, group, 0o700),
        ("var/lib/traceflow", owner, group, 0o711),
        ("var/lib/traceflow/test-evidence", uid, gid, 0o700),
        ("var/www/traceflow", owner, group, 0o755),
    ]]


def prepare(root, user="traceflow", group="traceflow", apply=False):
    require(root.is_absolute() and ".." not in root.parts, "absolute canonical root required")
    checked_directory(root)
    require(root.is_dir() and str(root) == os.path.realpath(root), "real existing root required")
    if root == Path("/"):
        require(sys.platform == "linux" and os.geteuid() == 0, "Linux root required")
        require(user == group == "traceflow", "production identity is fixed")
        account = pwd.getpwnam(user)
        require(account.pw_uid != 0 and account.pw_shell in ("/sbin/nologin", "/usr/sbin/nologin", "/bin/false"), "noninteractive service account required")
    else:
        temp = Path(tempfile.gettempdir()).resolve()
        require(temp in root.parents and root != temp, "test root must be an owned temporary child")
        marker = root / ".traceflow-runtime-test"
        require(marker.is_file() and not marker.is_symlink(), "test marker required")
        require(root.stat().st_uid == marker.stat().st_uid == os.geteuid(), "test root ownership mismatch")
        require(root.stat().st_mode & 0o077 == 0, "test root must be private")
    account = pwd.getpwnam(user)
    group_info = grp.getgrnam(group)
    targets = plan(root, account.pw_uid, group_info.gr_gid)
    # Complete preflight before the first change; do not repair symlinks or files.
    for path, _, _, _ in targets:
        checked_directory(path)
        for parent in path.parents:
            if parent == root:
                break
            if parent.exists():
                info = parent.stat()
                require(info.st_uid == os.geteuid() and not info.st_mode & 0o022,
                        "ancestor must be installer-owned and not group/other writable")
    for path, uid, gid, mode in targets:
        if apply:
            # Installer-owned parents prevent unprivileged path substitution.
            path.mkdir(parents=True, exist_ok=True, mode=0o755)
            fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                info = os.fstat(fd)
                if (info.st_uid, info.st_gid) != (uid, gid):
                    os.fchown(fd, uid, gid)
                os.fchmod(fd, mode)
                info = os.fstat(fd)
                require((info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) == (uid, gid, mode), "directory verification failed")
            finally:
                os.close(fd)
    return [{"path": str(p), "uid": u, "gid": g, "mode": oct(m)} for p, u, g, m in targets]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/"))
    parser.add_argument("--user", default="traceflow")
    parser.add_argument("--group", default="traceflow")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        result = prepare(args.root, args.user, args.group, args.apply)
        for row in result:
            print(("PREPARED" if args.apply else "PLAN"), row["path"], row["mode"], row["uid"], row["gid"])
    except (OSError, ValueError, KeyError):
        sys.exit("PREPARATION_REFUSED: verify identity, ancestors, ownership and permissions; nothing is deleted")
