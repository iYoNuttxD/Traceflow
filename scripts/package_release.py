#!/usr/bin/env python3
"""Build from an explicit Git commit; candidate recipes are never production approved."""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"deploy/lib"))
from release_contract import Refused, require, digest, encoded, file_digest, inventory, pack, schema_contract, extract_verified, descriptor, read_json

ROOT=Path(__file__).resolve().parents[1]
ALLOW=("backend/src/","backend/prisma/","frontend/src/","frontend/public/")
FILES={"backend/package.json","backend/package-lock.json","frontend/package.json","frontend/package-lock.json",
       "frontend/index.html","frontend/vite.config.js","frontend/production-contract.js","deploy/scripts/validate-service-environment.mjs"}
RECIPES=("scripts/package-release.mjs","scripts/package_release.py","deploy/lib/release_contract.py",
         "deploy/scripts/artifact-smoke.mjs","deploy/scripts/release.py","deploy/scripts/release-database.mjs","deploy/scripts/lib/migration-contract.mjs",
         "deploy/lib/operational_io.py","deploy/lib/runtime_grants.py","deploy/lib/activation_contract.py",
         "deploy/lib/activation_accounts.py","deploy/lib/activation_window.py","deploy/lib/recovery_policy.py",
         "deploy/lib/recovery_snapshot.py","deploy/lib/recovery_archive.py","deploy/scripts/recovery-backup.py",
         "deploy/systemd/traceflow-recovery-backup.service","deploy/systemd/traceflow-recovery-backup.timer")
def command(args,cwd=None,env=None):
    r=subprocess.run(args,cwd=cwd,env=env,capture_output=True)
    require(r.returncode==0,"COMMAND_FAILED_"+Path(args[0]).name)
    return r.stdout
def export(args):
    commit=command(["git","rev-parse",args.commit+"^{commit}"],ROOT).decode().strip()
    require(len(commit)==40,"COMMIT_REQUIRED")
    out=Path(args.output).absolute();require(not out.exists(),"OUTPUT_EXISTS")
    paths=command(["git","ls-tree","-r","--name-only",commit],ROOT).decode().splitlines()
    selected=[p for p in paths if p in FILES or p.startswith(ALLOW)]
    require(FILES.issubset(selected),"SOURCE_INCOMPLETE")
    out.mkdir(mode=0o700,parents=False)
    try:
        for name in selected:
            data=command(["git","show",commit+":"+name],ROOT)
            file=out/name;file.parent.mkdir(parents=True,exist_ok=True)
            file.write_bytes(data);file.chmod(0o644)
        candidate=False
        for name in RECIPES:
            data=(ROOT/name).read_bytes()
            r=subprocess.run(["git","show",commit+":"+name],cwd=ROOT,capture_output=True)
            if r.returncode or r.stdout!=data: candidate=True
            file=out/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data);file.chmod(0o644)
        require(not candidate or args.candidate,"UNCOMMITTED_RECIPE_REQUIRES_CANDIDATE")
        snapshot=inventory(out)
        proof={"formatVersion":1,"commitSha":commit,"sourceState":"candidate" if candidate else "committed",
               "files":snapshot,"recipeSha256":digest(encoded({p:snapshot[p]["sha256"] for p in RECIPES}))}
        (out/"source.json").write_bytes(encoded(proof))
        print(json.dumps({"exported":str(out),"commit":commit,"sourceState":proof["sourceState"],"sourceSha256":file_digest(out/"source.json")}))
    except BaseException:
        # Only our just-created output is removed; a preexisting output was refused.
        shutil.rmtree(out);raise
def prune_dependency_files(root):
    for p in sorted(root.rglob("*"),reverse=True):
        if p.is_symlink():
            require(".bin" in p.parts,"UNEXPECTED_DEPENDENCY_SYMLINK")
            p.unlink()
        elif p.is_file() and (p.suffix==".map" or p.name.endswith(".d.ts") or p.name in {".package-lock.json"} or (p.suffix.lower()==".md" and not p.name.upper().startswith(("LICENSE","NOTICE","COPYING")))):
            p.unlink()
    # Argon2 ships prebuilds for all platforms; preserve only glibc Linux ARM64.
    pre=root/"argon2/prebuilds"
    if pre.exists():
        for d in pre.iterdir():
            if d.name!="linux-arm64": shutil.rmtree(d)
        for f in (pre/"linux-arm64").glob("*musl*"):f.unlink()
    for p in root.rglob("*"):
        if p.is_file(): p.chmod(0o755 if p.stat().st_mode&0o111 else 0o644)
        elif p.is_dir():p.chmod(0o755)
@contextlib.contextmanager
def build_workspace(build_id):
    # Prisma embeds generator source/output paths. A fixed, exclusively owned build path
    # makes repeated builds byte-identical without rewriting generated client code.
    work=Path("/tmp")/("traceflow-build-"+build_id)
    require(not work.exists() and not work.is_symlink(),"BUILD_WORKSPACE_EXISTS")
    work.mkdir(mode=0o700)
    identity=(work.stat().st_ino,work.stat().st_uid)
    try:yield str(work)
    finally:
        require(not work.is_symlink() and work.is_dir() and
                (work.stat().st_ino,work.stat().st_uid)==identity,"BUILD_CLEANUP_IDENTITY")
        shutil.rmtree(work)

def build(args):
    require(platform.system()=="Linux" and platform.machine() in {"aarch64","arm64"},"NATIVE_LINUX_ARM64_REQUIRED")
    require("Oracle Linux" in Path("/etc/oracle-release").read_text() and "9.8" in Path("/etc/oracle-release").read_text(),"ORACLE98_REQUIRED")
    source=Path(args.source).resolve();proof=json.loads((source/"source.json").read_bytes())
    actual=inventory(source);actual.pop("source.json",None)
    require(actual==proof["files"],"SOURCE_INTEGRITY")
    require(args.source_sha256==file_digest(source/"source.json"),"SOURCE_TRUST")
    output=Path(args.output).absolute();require(not output.exists(),"OUTPUT_EXISTS")
    stamp=dt.datetime.fromtimestamp(args.epoch,dt.timezone.utc)
    require(2026<=stamp.year<=2100 and len(args.build_id)==12 and all(c in "abcdef0123456789" for c in args.build_id),"BUILD_ID")
    rid=stamp.strftime("%Y%m%dT%H%M%SZ")+"-"+proof["commitSha"]+"-"+args.build_id
    with build_workspace(args.build_id) as temp:
        work=Path(temp);home=work/"home";home.mkdir()
        empty=work/"npm-user.conf";empty.touch()
        global_config=work/"npm-global.conf";global_config.touch()
        env={"PATH":os.environ["PATH"],"HOME":str(home),"LANG":"C.UTF-8","TZ":"UTC",
             "NPM_CONFIG_USERCONFIG":str(empty),"NPM_CONFIG_GLOBALCONFIG":str(global_config),
             "NPM_CONFIG_CACHE":str(work/"cache"),"NPM_CONFIG_REGISTRY":"https://registry.npmjs.org",
             "SOURCE_DATE_EPOCH":str(args.epoch),"PRISMA_HIDE_UPDATE_MESSAGE":"1","CHECKPOINT_DISABLE":"1",
             "PRISMA_SKIP_POSTINSTALL_GENERATE":"true","DATABASE_URL":"mysql://127.0.0.1:1/unused_build_guard"}
        node=command(["node","-p","process.versions.node"],env=env).decode().strip()
        npm=command(["npm","--version"],env=env).decode().strip()
        require(node.split(".")[0]=="22","NODE22_REQUIRED")
        openssl=command(["openssl","version"],env=env).decode().strip()
        require(openssl.startswith("OpenSSL 3."),"OPENSSL3_REQUIRED")
        for component in ("backend","frontend"):
            shutil.copytree(source/component,work/component)
            print(json.dumps({"phase":"npm-ci","component":component}),flush=True)
            command(["npm","ci","--no-audit","--no-fund"],work/component,env)
        command(["node","node_modules/prisma/build/index.js","validate"],work/"backend",env)
        command(["node","node_modules/prisma/build/index.js","generate"],work/"backend",env)
        env["VITE_API_URL"]="/api"
        command(["npm","run","build"],work/"frontend",env)
        runtime=work/"runtime";admin=work/"admin";runtime.mkdir();admin.mkdir()
        for name in ("src","prisma","package.json","package-lock.json"):
            src=work/"backend"/name;dst=runtime/"backend"/name;dst.parent.mkdir(parents=True,exist_ok=True)
            shutil.copytree(src,dst) if src.is_dir() else shutil.copyfile(src,dst)
        # CLI belongs to the administrative artifact, never to application startup.
        shutil.copytree(work/"backend/node_modules",admin/"node_modules")
        for name in ("package.json","package-lock.json"):shutil.copyfile(work/"backend"/name,admin/name)
        shutil.copytree(work/"backend/prisma",admin/"prisma")
        command(["npm","prune","--omit=dev","--ignore-scripts","--no-audit","--no-fund"],work/"backend",env)
        shutil.copytree(work/"backend/node_modules",runtime/"backend/node_modules")
        # Prune may discard .prisma; fail smoke rather than silently regenerating at deploy.
        prune_dependency_files(runtime/"backend/node_modules");prune_dependency_files(admin/"node_modules")
        # Prisma is an optional peer of @prisma/client and npm may retain it after prune.
        # Generation is complete; the final native/API/worker probes prove CLI independence.
        cli_runtime=runtime/"backend/node_modules/prisma"
        if cli_runtime.exists():shutil.rmtree(cli_runtime)
        require(not cli_runtime.exists(),"CLI_IN_RUNTIME")
        shutil.copytree(work/"frontend/dist",runtime/"frontend/dist")
        for name in [*RECIPES[2:],"deploy/scripts/validate-service-environment.mjs"]:
            dst=runtime/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/name,dst)
        schema=schema_contract(runtime)
        result=json.loads(command(["node",str(runtime/"deploy/scripts/artifact-smoke.mjs"),str(runtime)],work,env))
        require(result["artifactSmoke"]=="PASS","ARTIFACT_SMOKE")
        common={"formatVersion":1,"application":"TraceFlow","releaseId":rid,"commitSha":proof["commitSha"],
                "buildTimestampUtc":stamp.isoformat().replace("+00:00","Z"),"buildId":args.build_id,
                "sourceState":proof["sourceState"],"sourceSha256":args.source_sha256,"recipeSha256":proof["recipeSha256"],
                "nodeVersion":node,"npmVersion":npm,"prismaVersion":"6.12.0",
                "platform":{"os":"linux","architecture":"arm64","distribution":"Oracle Linux 9.8","opensslMajor":3},
                "openssl":openssl,"schema":schema,"frontend":{"apiBase":"/api","timeoutMs":15000,"promotableAcrossOrigins":True},
                "checks":{"nativeSmoke":result,"schemaValidated":True,"frontendBuild":True}}
        output.mkdir(mode=0o700)
        artifacts={kind:pack(tree,output/(kind+".tar.gz"),dict(common,kind=kind)) for kind,tree in (("runtime",runtime),("admin",admin))}
        descriptor={"formatVersion":1,"releaseId":rid,"commitSha":proof["commitSha"],"artifacts":artifacts}
        (output/"release.json").write_bytes(encoded(descriptor))
        for kind in artifacts:
            dest=work/("extracted-"+kind);dest.mkdir()
            extract_verified(output/(kind+".tar.gz"),dest,kind,artifacts[kind]["manifestSha256"])
        command(["node",str(work/"extracted-runtime/deploy/scripts/artifact-smoke.mjs"),str(work/"extracted-runtime")],work,env)
        print(json.dumps({"releaseId":rid,"descriptorSha256":file_digest(output/"release.json"),"artifacts":artifacts,"extractedSmoke":"PASS"}))
def validate_reuse_sources(source, old_source, expected, old_expected):
    proof=read_json(source/"source.json");old=read_json(old_source/"source.json")
    require(file_digest(source/"source.json")==expected and file_digest(old_source/"source.json")==old_expected,"SOURCE_TRUST")
    for root,record in ((source,proof),(old_source,old)):
        actual=inventory(root);actual.pop("source.json",None)
        require(actual==record["files"],"SOURCE_INTEGRITY")
    unchanged=lambda name:name.startswith(ALLOW) or name in FILES
    current={k:v for k,v in proof["files"].items() if unchanged(k)}
    previous={k:v for k,v in old["files"].items() if unchanged(k)}
    require(current==previous,"APPLICATION_REBUILD_REQUIRED")
    return proof

def repack(args):
    """Controller-only rebuild; never substitutes macOS modules for Linux artifacts."""
    require(platform.system()=="Linux" and platform.machine() in {"aarch64","arm64"},"NATIVE_LINUX_ARM64_REQUIRED")
    require("9.8" in Path("/etc/oracle-release").read_text(),"ORACLE98_REQUIRED")
    source=Path(args.source).resolve();old_source=Path(args.previous_source).resolve()
    previous=descriptor(Path(args.previous_descriptor).absolute(),args.previous_digest)
    output=Path(args.output).absolute();require(not output.exists(),"OUTPUT_EXISTS")
    stamp=dt.datetime.fromtimestamp(args.epoch,dt.timezone.utc)
    require(2026<=stamp.year<=2100 and len(args.build_id)==12 and all(c in "abcdef0123456789" for c in args.build_id),"BUILD_ID")
    with build_workspace(args.build_id) as temp:
        work=Path(temp);trees={}
        for kind in ("runtime","admin"):
            tree=work/kind;tree.mkdir()
            extract_verified(Path(args.previous_descriptor).parent/previous["artifacts"][kind]["file"],tree,kind,previous["artifacts"][kind]["manifestSha256"])
            trees[kind]=tree
        old=read_json(trees["runtime"]/"manifest.json")
        require(old["sourceState"]=="committed" and old["releaseId"]==previous["releaseId"] and
                read_json(trees["admin"]/"manifest.json")["schema"]==old["schema"],"REUSE_PROVENANCE")
        proof=validate_reuse_sources(source,old_source,args.source_sha256,old["sourceSha256"])
        for name,record in proof["files"].items():
            if name.startswith(("backend/src/","backend/prisma/")) or name in ("backend/package.json","backend/package-lock.json"):
                require(file_digest(trees["runtime"]/name)==record["sha256"],"RUNTIME_SOURCE_MISMATCH")
        before={kind:inventory(tree) for kind,tree in trees.items()}
        for name in [*RECIPES[2:],"deploy/scripts/validate-service-environment.mjs"]:
            dst=trees["runtime"]/name;dst.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(source/name,dst);dst.chmod(0o644)
        require(schema_contract(trees["runtime"])==old["schema"] and schema_contract(trees["admin"],"admin")==old["schema"],"MIGRATION_INTEGRITY")
        after={kind:inventory(tree) for kind,tree in trees.items()}
        changed={name for name in set(before["runtime"])|set(after["runtime"]) if before["runtime"].get(name)!=after["runtime"].get(name)}
        require(changed<=set(RECIPES[2:]) and before["admin"]==after["admin"],"UNEXPECTED_REPACK_CHANGE")
        env={"PATH":os.environ["PATH"],"HOME":"/nonexistent","LANG":"C.UTF-8","TZ":"UTC",
             "CHECKPOINT_DISABLE":"1","PRISMA_HIDE_UPDATE_MESSAGE":"1"}
        node=command(["node","-p","process.versions.node"],env=env).decode().strip()
        require(node==old["nodeVersion"]=="22.23.2","NODE_VERSION")
        result=json.loads(command(["node",str(trees["runtime"]/"deploy/scripts/artifact-smoke.mjs"),str(trees["runtime"])],work,env))
        require(result["artifactSmoke"]=="PASS","ARTIFACT_SMOKE")
        rid=stamp.strftime("%Y%m%dT%H%M%SZ")+"-"+proof["commitSha"]+"-"+args.build_id
        common={k:v for k,v in old.items() if k not in ("files","kind")}
        common.update(releaseId=rid,commitSha=proof["commitSha"],sourceState=proof["sourceState"],
                      buildTimestampUtc=stamp.isoformat().replace("+00:00","Z"),buildId=args.build_id,
                      sourceSha256=args.source_sha256,recipeSha256=proof["recipeSha256"],
                      reuse={"descriptorSha256":args.previous_digest,"releaseId":previous["releaseId"],
                             "unchangedApplicationSources":True,"unchangedDependencies":True,"changedFiles":sorted(changed)},
                      checks={"nativeSmoke":result,"schemaValidated":True,"frontendBuild":"verified-reuse"})
        output.mkdir(mode=0o700)
        artifacts={kind:pack(tree,output/(kind+".tar.gz"),dict(common,kind=kind)) for kind,tree in trees.items()}
        desc={"formatVersion":1,"releaseId":rid,"commitSha":proof["commitSha"],"artifacts":artifacts}
        (output/"release.json").write_bytes(encoded(desc))
        for kind,record in artifacts.items():
            dest=work/("verified-"+kind);dest.mkdir()
            extract_verified(output/record["file"],dest,kind,record["manifestSha256"])
        command(["node",str(work/"verified-runtime/deploy/scripts/artifact-smoke.mjs"),str(work/"verified-runtime")],work,env)
        print(json.dumps({"releaseId":rid,"sourceState":proof["sourceState"],"descriptorSha256":file_digest(output/"release.json"),"artifacts":artifacts,"extractedSmoke":"PASS","changedFiles":sorted(changed)}))

def main():
    p=argparse.ArgumentParser();sub=p.add_subparsers(dest="action",required=True)
    e=sub.add_parser("export");e.add_argument("--commit",required=True);e.add_argument("--output",required=True);e.add_argument("--candidate",action="store_true")
    b=sub.add_parser("build");b.add_argument("--source",required=True);b.add_argument("--source-sha256",required=True);b.add_argument("--output",required=True);b.add_argument("--epoch",required=True,type=int);b.add_argument("--build-id",required=True)
    r=sub.add_parser("repack-controller")
    for name in ("source","source-sha256","previous-source","previous-descriptor","previous-digest","output","build-id"):r.add_argument("--"+name,required=True)
    r.add_argument("--epoch",required=True,type=int)
    args=p.parse_args()
    {"export":export,"build":build,"repack-controller":repack}[args.action](args)
if __name__=="__main__":
    try:main()
    except (Refused,OSError,ValueError,KeyError) as e:
        print(json.dumps({"status":"REFUSED","code":str(e) if isinstance(e,Refused) else type(e).__name__}),file=sys.stderr);sys.exit(1)
