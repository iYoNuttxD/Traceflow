"""TraceFlow release format v1. Standard library; no environment/config loading."""
import contextlib
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import tarfile
import tempfile

class Refused(RuntimeError):
    pass

def require(ok, code):
    if not ok:
        raise Refused(code)

def encoded(obj):
    return (json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def file_digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def read_json(path):
    require(not path.is_symlink() and path.is_file(), "JSON_FILE_REQUIRED")
    def unique(pairs):
        result={}
        for key,value in pairs:
            require(key not in result,"DUPLICATE_JSON_FIELD")
            result[key]=value
        return result
    return json.loads(path.read_bytes(),object_pairs_hook=unique,
                      parse_constant=lambda _: require(False,"INVALID_JSON_NUMBER"))

def safe_relative(value):
    p = PurePosixPath(value)
    require(isinstance(value, str) and value and not p.is_absolute()
            and str(p) == value and all(x not in ("", ".", "..") for x in p.parts)
            and "\\" not in value and not any(ord(c) < 32 for c in value), "UNSAFE_MEMBER")
    return value

def release_id(value):
    require(bool(re.fullmatch(r"\d{8}T\d{6}Z-[a-f0-9]{40}-[a-f0-9]{12}", value)), "INVALID_RELEASE_ID")
    return value

def trusted_path(path, directory=None, uid=None):
    path = Path(os.path.abspath(path))
    # All ancestors must be real. Sticky /tmp is acceptable only as an ancestor.
    for entry in [*reversed(path.parents), path]:
        try: st = entry.lstat()
        except FileNotFoundError: raise Refused("PATH_MISSING")
        require(not stat.S_ISLNK(st.st_mode), "SYMLINK_PATH")
        require(stat.S_ISDIR(st.st_mode) if entry != path or directory else stat.S_ISREG(st.st_mode), "INVALID_PATH_TYPE")
        require(not st.st_mode & 0o022 or bool(st.st_mode & stat.S_ISVTX) and entry != path, "WRITABLE_PATH")
    if uid is not None:
        require(path.stat().st_uid == uid, "WRONG_OWNER")
    return path

def private_json(path):
    trusted_path(path, uid=os.geteuid())
    require(path.stat().st_mode & 0o077 == 0, "PRIVATE_FILE_REQUIRED")
    return read_json(path)

def atomic_json(path, data, mode=0o600):
    require(not path.is_symlink(), "SYMLINK_STATE")
    fd, name = tempfile.mkstemp(prefix=".write-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            os.fchmod(f.fileno(), mode)
            f.write(encoded(data)); f.flush(); os.fsync(f.fileno())
        os.replace(name, path)
        fsync_dir(path.parent)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(fd)
    finally: os.close(fd)

@contextlib.contextmanager
def exclusive_lock(path):
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        st = os.fstat(fd)
        require(stat.S_ISREG(st.st_mode) and st.st_uid == os.geteuid() and not st.st_mode & 0o077, "LOCK_IDENTITY")
        try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise Refused("OPERATION_LOCKED")
        yield
    finally: os.close(fd)  # Never unlink: all waiters must share the same inode.

def content_policy(name, path):
    safe_relative(name)
    parts = PurePosixPath(name).parts
    leaf = parts[-1].lower()
    # This reviewed source module implements upload validation; it is not user data.
    # Keep the exception exact, and still apply all content/secret checks below.
    source_upload_contract = name == "backend/src/modules/testCases/uploads/upload-contract.js"
    require(not any(part.lower() in {"uploads","test-evidence","backups","logs",".git",".data",".cache"}
                    and not (source_upload_contract and part == "uploads") for part in parts), "FORBIDDEN_CONTENT")
    require(not any(p.lower().startswith(".env") for p in parts) and leaf not in {"credentials","tokens","terraform.tfstate","terraform.tfstate.backup"}, "FORBIDDEN_CONTENT")
    require(not leaf.endswith((".key",".log",".bak",".dump",".sql.gz")), "FORBIDDEN_CONTENT")
    require(not leaf.endswith(".sql") or "/prisma/migrations/" in "/" + name, "SQL_OUTSIDE_MIGRATIONS")
    # Public certificates are allowed. Private key content is not, independent of suffix.
    if path.stat().st_size <= 64 * 1024 * 1024:
        data = path.read_bytes()
        require(not re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{30,}", data), "SECRET_PATTERN")
        if "/node_modules/" not in "/" + name:
            require(not re.search(rb"mysql://[^\s/:]+:[^\s@]+@", data), "CREDENTIAL_URL")
    if name.startswith("frontend/dist/"):
        require(not leaf.endswith((".map",".pem",".sql",".key")) and not any(x in {"src","node_modules"} for x in parts), "PUBLIC_SOURCE")
        if leaf.endswith((".js",".css",".html")):
            require(not re.search(rb"https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/api", path.read_bytes()), "LOCAL_API_IN_BUNDLE")

def inventory(root, policy=True, omit_manifest=True):
    result = {}
    for path in sorted(root.rglob("*")):
        st = path.lstat()
        require(not stat.S_ISLNK(st.st_mode), "TREE_SYMLINK")
        require(st.st_uid == root.stat().st_uid, "TREE_OWNER")
        if stat.S_ISDIR(st.st_mode):
            require(not st.st_mode & 0o022, "TREE_DIRECTORY_MODE")
            continue
        require(stat.S_ISREG(st.st_mode) and st.st_nlink == 1 and not st.st_mode & 0o022, "TREE_FILE_MODE")
        name = path.relative_to(root).as_posix()
        if omit_manifest and name == "manifest.json": continue
        if policy: content_policy(name, path)
        result[name] = {"sha256": file_digest(path), "size": st.st_size, "mode": 0o755 if st.st_mode & 0o111 else 0o644}
    require(bool(result), "EMPTY_TREE")
    return result

def schema_contract(root, kind="runtime"):
    base = root / ("backend/prisma" if kind == "runtime" else "prisma")
    chain = [{"name": p.parent.name, "sha256": file_digest(p)}
             for p in sorted((base/"migrations").glob("*/migration.sql"))]
    require(chain and all(re.fullmatch(r"\d{14}(?:_[a-zA-Z0-9_]+)?", x["name"]) for x in chain), "INVALID_MIGRATION_CHAIN")
    return {"policy": "exact-chain-and-live-drift-v1", "schemaSha256": file_digest(base/"schema.prisma"),
            "migrations": chain, "chainSha256": digest(encoded(chain))}

def validate_manifest(m, kind):
    require(m.get("formatVersion") == 1 and m.get("application") == "TraceFlow" and m.get("kind") == kind, "MANIFEST_FORMAT")
    release_id(m.get("releaseId", ""))
    require(re.fullmatch(r"[a-f0-9]{40}", m.get("commitSha","")) and m["commitSha"] in m["releaseId"], "COMMIT_ID")
    require(m.get("platform") == {"os":"linux","architecture":"arm64","distribution":"Oracle Linux 9.8","opensslMajor":3}, "PLATFORM_MISMATCH")
    require(m.get("nodeVersion","").split(".")[0] == "22" and m.get("prismaVersion") == "6.12.0", "RUNTIME_VERSION")
    require(m.get("sourceState") in ("committed", "candidate"), "SOURCE_PROVENANCE")
    require(isinstance(m.get("files"),dict) and 0 < len(m["files"]) < 100000, "FILE_INVENTORY")
    for name, rec in m["files"].items():
        safe_relative(name)
        require(name != "manifest.json" and re.fullmatch("[a-f0-9]{64}",rec["sha256"])
                and 0 <= rec["size"] <= 512*1024*1024 and rec["mode"] in (0o644,0o755), "FILE_RECORD")
    require(sum(r["size"] for r in m["files"].values()) < 3*1024**3, "ARTIFACT_TOO_LARGE")
    schema=m.get("schema",{});chain=schema.get("migrations",[])
    require(schema.get("policy")=="exact-chain-and-live-drift-v1" and
            bool(re.fullmatch("[a-f0-9]{64}",schema.get("schemaSha256",""))) and
            isinstance(chain,list) and 0<len(chain)<1000,"SCHEMA_CONTRACT")
    for item in chain:
        require(isinstance(item,dict) and set(item)=={"name","sha256"} and
                bool(re.fullmatch(r"\d{14}(?:_[a-zA-Z0-9_]+)?",item["name"])) and
                bool(re.fullmatch("[a-f0-9]{64}",item["sha256"])),"INVALID_MIGRATION_CHAIN")
    names=[x["name"] for x in chain]
    require(names==sorted(set(names)),"INVALID_MIGRATION_CHAIN")
    require(schema["chainSha256"] == digest(encoded(chain)), "SCHEMA_DIGEST")

def verify_tree(root, kind, expected_manifest=None):
    m = read_json(root/"manifest.json")
    validate_manifest(m,kind)
    if expected_manifest: require(file_digest(root/"manifest.json") == expected_manifest, "MANIFEST_DIGEST")
    require(inventory(root) == m["files"], "TREE_INTEGRITY")
    if kind == "runtime":
        require(schema_contract(root) == m["schema"], "MIGRATION_INTEGRITY")
        for name in ("backend/src/server.js","backend/src/github-worker.js","frontend/dist/index.html","deploy/scripts/validate-service-environment.mjs"):
            require(name in m["files"], "RUNTIME_LAYOUT")
    else:
        require("node_modules/prisma/build/index.js" in m["files"], "ADMIN_CLI_MISSING")
        require(schema_contract(root,"admin")==m["schema"], "ADMIN_MIGRATION_INTEGRITY")
    return m

def pack(root, output, manifest):
    manifest = dict(manifest, files=inventory(root))
    validate_manifest(manifest, manifest["kind"])
    (root/"manifest.json").write_bytes(encoded(manifest))
    with output.open("xb") as raw:
        with gzip.GzipFile(filename="",mode="wb",fileobj=raw,mtime=0,compresslevel=6) as zipped:
            with tarfile.open(fileobj=zipped,mode="w",format=tarfile.PAX_FORMAT) as tar:
                for name in sorted([*manifest["files"],"manifest.json"]):
                    data=(root/name).read_bytes()
                    info=tarfile.TarInfo(name);info.size=len(data)
                    info.mode=manifest["files"].get(name,{}).get("mode",0o644)
                    info.mtime=0;info.uid=info.gid=0;info.uname=info.gname=""
                    tar.addfile(info,io.BytesIO(data))
    return {"file":output.name,"sha256":file_digest(output),"manifestSha256":file_digest(root/"manifest.json")}

def extract_verified(archive, destination, kind, manifest_digest):
    require(destination.is_dir() and not any(destination.iterdir()), "EMPTY_EXTRACTION_REQUIRED")
    # Do not use extractall, even on Python versions with extraction filters.
    with tarfile.open(archive,"r:gz") as tar:
        members=[];total=0;names=set()
        for member in tar:
            require(len(members)<100000 and member.name not in names, "DUPLICATE_MEMBERS")
            require(member.type in (tarfile.REGTYPE,tarfile.AREGTYPE) and not member.linkname and not member.sparse and member.mode in (0o644,0o755), "UNSAFE_ARCHIVE_TYPE")
            require(0<=member.size<=512*1024*1024, "ARTIFACT_TOO_LARGE")
            total+=member.size
            require(total<3*1024**3,"ARTIFACT_TOO_LARGE")
            safe_relative(member.name);names.add(member.name);members.append(member)
        for m in members: safe_relative(m.name)
        manifest_entry=next((m for m in members if m.name=="manifest.json"),None)
        require(manifest_entry and manifest_entry.size < 32*1024*1024, "MANIFEST_MISSING")
        data=tar.extractfile(manifest_entry).read()
        require(digest(data)==manifest_digest,"MANIFEST_DIGEST")
        manifest=json.loads(data);validate_manifest(manifest,kind)
        require({m.name for m in members} == {*manifest["files"],"manifest.json"},"ARCHIVE_INVENTORY")
        for entry in members:
            if entry.name!="manifest.json":
                rec=manifest["files"][entry.name]
                require(entry.size==rec["size"] and entry.mode==rec["mode"],"ARCHIVE_METADATA")
            out=destination/entry.name;out.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
            with out.open("xb") as f, tar.extractfile(entry) as src: shutil.copyfileobj(src,f)
            out.chmod(entry.mode)
        return verify_tree(destination,kind,manifest_digest)

def descriptor(path, expected):
    require(re.fullmatch("[a-f0-9]{64}",expected or ""), "TRUSTED_DIGEST_REQUIRED")
    trusted_path(path)
    require(file_digest(path)==expected,"DESCRIPTOR_DIGEST")
    value=read_json(path)
    require(value.get("formatVersion")==1 and set(value.get("artifacts",{}))=={"runtime","admin"},"DESCRIPTOR_FORMAT")
    release_id(value["releaseId"])
    for kind, rec in value["artifacts"].items():
        require(rec["file"] == kind+".tar.gz","ARTIFACT_FILENAME")
        archive=path.parent/rec["file"];trusted_path(archive)
        require(file_digest(archive)==rec["sha256"],"ARCHIVE_DIGEST")
    return value


def operation_gates(auth, operation, disposable=False):
    """Migration readiness and application readiness are distinct approvals."""
    gates=auth.get("gates",{})
    require(gates.get("writersControlled") is True,"WRITERS_NOT_CONTROLLED")
    initial=operation in ("migrate-initial","inspect-initial-schema")
    if initial:
        plan=auth.get("initialization",{})
        recovery=plan.get("recovery",{})
        require(plan.get("formatVersion")==1 and
                recovery.get("strategy")=="stop-and-review-empty-initialization" and
                isinstance(recovery.get("planReference"),str) and len(recovery["planReference"])>=8 and
                isinstance(recovery.get("operatorId"),str) and len(recovery["operatorId"])>=3,
                "INITIAL_RECOVERY_PLAN_REQUIRED")
        require("backupReference" not in auth and "backupVerified" not in gates and
                "restoreRehearsed" not in gates,"INITIAL_BACKUP_CLAIM_FORBIDDEN")
    elif operation=="migrate":
        require("initialization" not in auth,"INITIAL_CONTRACT_ON_UPGRADE")
        require(gates.get("backupVerified") is True and gates.get("restoreRehearsed") is True and
                isinstance(auth.get("backupReference"),str) and len(auth["backupReference"])>=8,
                "MIGRATION_AUTHORIZATION")
    if not disposable:
        for key in ("heatwaveTlsHomologated","deploymentAuthorized"):
            require(gates.get(key) is True,"PRODUCTION_GATE_"+key)
        if operation in ("activate","rollback","recover","smoke"):
            for key in ("restoreRehearsed","uploadsResolved","smtpHomologated","githubAppHomologated"):
                require(gates.get(key) is True,"PRODUCTION_GATE_"+key)
        if operation=="recover-migration":
            require(auth.get("migrationKind") in ("initial","upgrade"),"RECOVERY_KIND")
            if auth["migrationKind"]=="upgrade":
                require(gates.get("restoreRehearsed") is True,"PRODUCTION_GATE_restoreRehearsed")
