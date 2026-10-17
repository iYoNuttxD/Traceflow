#!/usr/bin/env python3
"""Single release lifecycle CLI. No application data cleanup or automatic DDL rollback."""
import argparse
import contextlib
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import platform
import re
import select
import shutil
import signal
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import uuid
from urllib.parse import urlsplit
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"lib"))
from release_contract import (Refused,require,encoded,digest,file_digest,read_json,private_json,
    trusted_path,atomic_json,fsync_dir,exclusive_lock,release_id,descriptor,extract_verified,verify_tree,inventory,operation_gates)

SERVICES=("traceflow-api.service","traceflow-github-worker.service")
ASSET=re.compile(r"^[A-Za-z0-9_./-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|mp4|webm)$")
def now():return int(time.time())
def command(args,timeout=120,check=True):
    p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout,
                     env={"PATH":"/usr/sbin:/usr/bin:/sbin:/bin","LANG":"C.UTF-8"})
    if check:require(p.returncode==0,"COMMAND_FAILED_"+Path(args[0]).name)
    return p
def boot_id():return Path("/proc/sys/kernel/random/boot_id").read_text().strip()
def proc_start(pid):return Path("/proc",str(pid),"stat").read_text().rsplit(")",1)[1].split()[19]
def emit(event,**values):print(json.dumps(dict(event=event,**values)),flush=True)

class Layout:
    def __init__(self,root="/"):
        self.root=Path(os.path.abspath(root));self.lab=False
        if self.root != Path("/"):
            trusted_path(self.root,directory=True,uid=os.geteuid())
            mark=private_json(self.root/".traceflow-release-lab.json")
            require(mark.get("token")==os.environ.get("TF_RELEASE_LAB_TOKEN") and bool(mark.get("token")),"LAB_OWNERSHIP")
            self.lab=True
        elif Path("/run/traceflow-oci05-disposable").exists():
            mark=private_json(Path("/run/traceflow-oci05-disposable"))
            require(socket.gethostname()=="lima-tf05" and mark.get("token")==os.environ.get("TF_RELEASE_LAB_TOKEN") and bool(mark.get("token")),"LAB_VM_OWNERSHIP")
            require(command(["systemd-detect-virt"]).stdout.strip() not in ("","none"),"LAB_VIRTUALIZATION")
            self.lab=True
        self.app=self.root/"opt/traceflow";self.releases=self.app/"releases"
        self.admin=self.app/"administration";self.state=self.app/"shared/release-state"
        self.catalog=self.state/"catalog";self.web=self.root/"var/www/traceflow"
        self.generations=self.web/"generations";self.guard=self.app/"release-guard.json"
    def initialize(self):
        # Existing OCI-04 parents must already be protected. No broad chmod/chown.
        for p in (self.app,self.releases,self.app/"shared",self.web):
            trusted_path(p,directory=True,uid=os.geteuid())
        for p,mode in ((self.admin,0o700),(self.state,0o700),(self.catalog,0o700),(self.generations,0o755)):
            p.mkdir(exist_ok=True,mode=mode);trusted_path(p,directory=True,uid=os.geteuid())
            require(p.stat().st_mode&0o777==mode,"DIRECTORY_MODE")
        if not (self.state/"state.json").exists():
            require(not os.path.lexists(self.app/"current") and not os.path.lexists(self.web/"current"),"EXISTING_CURRENT_WITHOUT_STATE")
            self.save({"formatVersion":1,"status":"idle","current":None,"previous":None,"web":None,"history":{}})
    def load(self):
        trusted_path(self.state,directory=True,uid=os.geteuid())
        return private_json(self.state/"state.json")
    def save(self,state):
        atomic_json(self.state/"state.json",state)
        guard={k:state.get(k) for k in ("status","phase","current","target","bootId","pid","processStart")}
        atomic_json(self.guard,guard,0o644)
    def installed(self,rid,expected=None):
        release_id(rid)
        rec=private_json(self.catalog/(rid+".json"))
        if expected:require(rec["descriptorSha256"]==expected,"RELEASE_APPROVAL_DIGEST")
        d=rec["descriptor"]
        require(digest(encoded(d))==rec["descriptorSha256"],"CATALOG_INTEGRITY")
        r=self.releases/rid;a=self.admin/rid
        trusted_path(r,directory=True,uid=os.geteuid());trusted_path(a,directory=True,uid=os.geteuid())
        m=verify_tree(r,"runtime",d["artifacts"]["runtime"]["manifestSha256"])
        am=verify_tree(a,"admin",d["artifacts"]["admin"]["manifestSha256"])
        require(m["releaseId"]==am["releaseId"]==rid and m["schema"]==am["schema"],"ARTIFACT_PAIR_MISMATCH")
        return r,a,m
    def current_matches(self,state):
        for link,target in ((self.app/"current",self.releases/state["current"] if state["current"] else None),
                            (self.web/"current",self.generations/state["web"]/"dist" if state["web"] else None)):
            if target is None:require(not os.path.lexists(link),"UNEXPECTED_CURRENT")
            else:require(link.is_symlink() and os.readlink(link)==str(target),"CURRENT_STATE_MISMATCH")

def native_context(layout,allow_lab_root=False):
    require(platform.system()=="Linux" and platform.machine() in ("aarch64","arm64"),"NATIVE_PLATFORM")
    require(os.geteuid()==0,"ROOT_OPERATOR_REQUIRED")
    require("9.8" in Path("/etc/oracle-release").read_text(),"ORACLE98_REQUIRED")
    require(command(["/usr/bin/node","-p","process.versions.node.split('.')[0]"]).stdout.strip()=="22","NODE22_REQUIRED")
    if layout.root!=Path("/") and not (allow_lab_root and layout.lab):
        raise Refused("SYSTEMD_ONLY_IN_NATIVE_HOST_OR_MARKED_VM")

def stage(layout,path,expected):
    d=descriptor(Path(path).absolute(),expected);rid=d["releaseId"]
    with exclusive_lock(layout.state/"operation.lock"):
        require(not (layout.releases/rid).exists() and not (layout.admin/rid).exists() and not (layout.catalog/(rid+".json")).exists(),"RELEASE_ALREADY_EXISTS")
        with tempfile.TemporaryDirectory(prefix=".stage-",dir=layout.releases) as temporary:
            temp=Path(temporary);runtime=temp/"runtime";admin=temp/"admin";runtime.mkdir();admin.mkdir()
            # Work from private copies; validate again after copying to close the incoming-file race.
            incoming=temp/"incoming";incoming.mkdir()
            for name in ("release.json","runtime.tar.gz","admin.tar.gz"):
                shutil.copyfile(Path(path).parent/name,incoming/name)
            copied=descriptor(incoming/"release.json",expected)
            for kind,dest in (("runtime",runtime),("admin",admin)):
                extract_verified(incoming/copied["artifacts"][kind]["file"],dest,kind,copied["artifacts"][kind]["manifestSha256"])
            require(read_json(runtime/"manifest.json")["releaseId"]==rid and read_json(admin/"manifest.json")["releaseId"]==rid,"RELEASE_PAIR")
            runtime.chmod(0o755);admin.chmod(0o700)
            os.rename(runtime,layout.releases/rid);fsync_dir(layout.releases)
            os.rename(admin,layout.admin/rid);fsync_dir(layout.admin)
            atomic_json(layout.catalog/(rid+".json"),{"descriptorSha256":expected,"descriptor":d,"preparedAt":now()})
            if layout.root==Path("/") and platform.system()=="Linux":
                command(["restorecon","-R",str(layout.releases/rid),str(layout.admin/rid)])
    emit("release_staged",releaseId=rid,activeUnchanged=True)

def authorization(layout,path,operation,rid,expected):
    auth=private_json(Path(path).absolute())
    require(auth.get("formatVersion")==1 and auth.get("operation")==operation and auth.get("releaseId")==rid and
            auth.get("descriptorSha256")==expected,"AUTHORIZATION_MISMATCH")
    expiry=dt.datetime.fromisoformat(auth["expiresAt"].replace("Z","+00:00")).timestamp()
    require(time.time()<expiry<time.time()+86400,"AUTHORIZATION_EXPIRED")
    operation_gates(auth,operation,layout.lab)
    if layout.lab:require(auth.get("environment")=="disposable","LAB_AUTHORIZATION")
    else:
        require(auth.get("environment") in ("staging","production"),"ENVIRONMENT")

    return auth

class Database:
    def __init__(self,release,admin,auth,mode):
        allowed=(("TEST_DATABASE_URL","MIGRATION_DATABASE_URL","TF_RELEASE_LAB_TOKEN") if mode=="migrate" else
                 ("TEST_RUNTIME_DATABASE_URL","RUNTIME_DATABASE_URL","TF_RELEASE_LAB_TOKEN"))
        require(not os.environ.get("DATABASE_URL"),"AMBIGUOUS_DATABASE_URL")
        env={k:os.environ[k] for k in allowed if k in os.environ}
        env.update(PATH="/usr/bin:/bin",HOME="/nonexistent",LANG="C.UTF-8",TZ="UTC")
        self.p=subprocess.Popen(["/usr/bin/node",str(release/"deploy/scripts/release-database.mjs"),
            str(release),str(admin),str(Path(auth).absolute()),mode],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1,env=env)
        try:
            result=self.read(15)
            require(result.get("ready") is True,result.get("code","DATABASE_START_FAILED"))
        except BaseException:
            with contextlib.suppress(Refused):self.close()
            raise
    def read(self,timeout):
        require(select.select([self.p.stdout],[],[],timeout)[0],"DATABASE_TIMEOUT")
        line=self.p.stdout.readline();require(bool(line),"DATABASE_BRIDGE_EXITED")
        return json.loads(line)
    def ask(self,action,**fields):
        require(self.p.poll() is None,"DATABASE_BRIDGE_EXITED")
        self.p.stdin.write(json.dumps(dict(action=action,**fields))+"\n");self.p.stdin.flush()
        result=self.read(310 if action=="migrate" else 40)
        require(result.get("ok") is True,result.get("code","DATABASE_OPERATION_FAILED"))
        return result.get("result")
    def close(self):
        if self.p.poll() is None:
            self.p.stdin.close()
            try:self.p.wait(10)
            except subprocess.TimeoutExpired:
                self.p.kill();self.p.wait();raise Refused("DATABASE_CLOSE_TIMEOUT")
        require(self.p.returncode==0,"DATABASE_CLOSE_FAILED")
    def __enter__(self):return self
    def __exit__(self,kind,*_):
        if kind is None:self.close()
        else:
            with contextlib.suppress(Refused):self.close()

def service_state(name):
    p=command(["systemctl","show",name,"-p","ActiveState","-p","SubState","-p","MainPID","-p","User","-p","LoadState"],check=False)
    return dict(l.split("=",1) for l in p.stdout.splitlines() if "=" in l)
def assert_stopped():
    for service in SERVICES:
        s=service_state(service);require(s.get("ActiveState") in ("inactive","failed") and s.get("MainPID")=="0","WRITERS_RUNNING")
    # Same-host unmanaged entry points are refused; remote/manual writers remain an explicit operator gate.
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():continue
        try:args=(proc/"cmdline").read_bytes().split(b"\0")
        except (FileNotFoundError,ProcessLookupError):continue
        require(not any(x.endswith((b"/src/server.js",b"/src/github-worker.js")) for x in args),"UNMANAGED_WRITER")
def stop_services():
    for name in SERVICES:command(["systemctl","stop",name],timeout=100)
    assert_stopped()
def switch_link(link,target):
    require(not os.path.lexists(link) or link.is_symlink(),"CURRENT_NOT_SYMLINK")
    temporary=link.parent/(".link-"+uuid.uuid4().hex)
    try:
        temporary.symlink_to(target,target_is_directory=True)
        os.replace(temporary,link);fsync_dir(link.parent)
    finally:
        if temporary.is_symlink():temporary.unlink()
def generation(layout,rid,state):
    source=layout.releases/rid/"frontend/dist"
    gid=rid+"-"+uuid.uuid4().hex[:12];tmp=Path(tempfile.mkdtemp(prefix=".web-",dir=layout.generations))
    try:
        out=tmp/"dist";shutil.copytree(source,out)
        retained={rid}
        retained.update(k for k,v in state["history"].items() if now()-v["lastActivated"]<7*86400)
        retained.update(x for x in (state.get("current"),state.get("previous")) if x)
        for previous in sorted(retained-{rid}):
            old,_,_=layout.installed(previous)
            asset_root=old/"frontend/dist/assets"
            if not asset_root.exists():continue
            for file in sorted(asset_root.rglob("*")):
                if not file.is_file():continue
                name=file.relative_to(asset_root).as_posix()
                if not ASSET.fullmatch(name):continue
                dest=out/"assets"/name;dest.parent.mkdir(parents=True,exist_ok=True)
                if dest.exists():require(file_digest(dest)==file_digest(file),"ASSET_COLLISION")
                else:shutil.copyfile(file,dest)
        meta={"releaseId":rid,"retainedReleases":sorted(retained),"createdAt":now(),"files":inventory(out,omit_manifest=False)}
        atomic_json(tmp/"generation.json",meta,0o644)
        tmp.chmod(0o755);os.rename(tmp,layout.generations/gid);fsync_dir(layout.generations)
        if layout.root==Path("/"):command(["restorecon","-R",str(layout.generations/gid)])
        return gid
    finally:
        if tmp.exists():shutil.rmtree(tmp)
def check_generation(layout,gid,rid):
    require(bool(re.fullmatch(r"\d{8}T\d{6}Z-[a-f0-9]{40}-[a-f0-9]{12}-[a-f0-9]{12}",gid)),"GENERATION_ID")
    path=layout.generations/gid;trusted_path(path,directory=True,uid=os.geteuid())
    meta=read_json(path/"generation.json")
    require(meta["releaseId"]==rid and inventory(path/"dist",omit_manifest=False)==meta["files"],"PUBLIC_GENERATION_INTEGRITY")
    return meta

def local_probe(path):
    conn=http.client.HTTPConnection("127.0.0.1",3001,timeout=4)
    try:
        conn.request("GET",path);r=conn.getresponse();data=r.read(1048577)
        require(len(data)<=1048576,"PROBE_SIZE")
        return r.status,data
    finally:conn.close()
def process_release(service,path):
    s=service_state(service);require(s.get("ActiveState")=="active" and s.get("User")=="traceflow","SERVICE_NOT_ACTIVE")
    pid=int(s.get("MainPID","0"));require(pid>0,"SERVICE_NO_PID")
    require(Path(os.readlink("/proc/"+str(pid)+"/cwd"))==path/"backend","PROCESS_RELEASE")
    return pid
def frontend_probe(layout,auth,web):
    frontend=auth["frontend"];url=urlsplit(frontend["url"])
    require(url.scheme=="https" and url.path in ("","/") and not url.username and not url.query and not url.fragment,"FRONTEND_PROBE_ORIGIN")
    context=ssl.create_default_context(cafile=frontend.get("caFile") if layout.lab else None)
    def get(path):
        if layout.lab:
            class LocalTLS(http.client.HTTPSConnection):
                def connect(self):
                    sock=socket.create_connection(("127.0.0.1",443),5,("127.0.0.2",0))
                    self.sock=context.wrap_socket(sock,server_hostname=url.hostname)
            conn=LocalTLS(url.hostname,443,timeout=5,context=context)
        else:conn=http.client.HTTPSConnection(url.hostname,url.port or 443,timeout=10,context=context)
        try:
            conn.request("GET",path,headers={"Host":url.hostname})
            r=conn.getresponse();body=r.read(32*1024*1024)
            return r.status,{k.lower():v for k,v in r.getheaders()},body
        finally:conn.close()
    index=(web/"index.html").read_bytes()
    for path in ("/","/projects/release-smoke"):
        status,headers,body=get(path)
        require(status==200 and body==index and headers.get("x-content-type-options")=="nosniff" and "no-cache" in headers.get("cache-control",""),"FRONTEND_SMOKE")
    assets=re.findall(rb'(?:src|href)="(/assets/[^"]+)"',index)
    require(assets,"FRONTEND_ASSETS")
    for asset in assets:
        name=asset.decode();require(".." not in name,"ASSET_PATH")
        status,headers,body=get(name)
        require(status==200 and digest(body)==file_digest(web/name.lstrip("/")) and "immutable" in headers.get("cache-control",""),"ASSET_SMOKE")
    for path in ("/assets/not-a-release-file.js","/.env","/test-evidence/no-file"):
        require(get(path)[0]==404,"PRIVATE_OR_MISSING_FILE_PUBLIC")
    status,headers,body=get("/api/auth/me")
    require(status==401 and "application/json" in headers.get("content-type","") and json.loads(body).get("code")=="AUTHENTICATION_REQUIRED","API_PROXY_SMOKE")
def smoke(layout,rid,state,auth,db,started):
    path=layout.releases/rid
    api_pid=process_release(SERVICES[0],path);process_release(SERVICES[1],path)
    listeners=command(["ss","-ltnp"]).stdout.splitlines()
    socket_rows=[line.split() for line in listeners if len(line.split())>=5]
    require(any(row[3]=="127.0.0.1:3001" and "pid="+str(api_pid)+"," in " ".join(row[5:]) for row in socket_rows),"API_LOOPBACK")
    require(not any(row[3] in ("0.0.0.0:3001","[::]:3001","*:3001") for row in socket_rows),"PUBLIC_LISTENER")
    for route in ("/health/live","/health/ready"):
        status,body=local_probe(route);require(status==200 and isinstance(json.loads(body),dict),"API_HEALTH")
    db.ask("compatible")
    hb=db.ask("heartbeat",since=started-60000,startedAt=started)
    require(hb["count"]==1 and hb["fresh"],"WORKER_HEARTBEAT")
    check_generation(layout,state["web"],rid)
    frontend_probe(layout,auth,layout.generations/state["web"]/"dist")
def phase(layout,state,name):
    state["phase"]=name;layout.save(state)
    emit("release_phase",phase=name,releaseId=state.get("target"))
def start_services(layout,state,rid,auth,db):
    phase(layout,state,"starting-api")
    command(["systemctl","reset-failed",*SERVICES],check=False)
    command(["systemctl","start",SERVICES[0]])
    deadline=time.monotonic()+30
    while True:
        db.ask("check")
        try:ready=local_probe("/health/ready")[0]==200
        except OSError:ready=False
        if ready:break
        require(time.monotonic()<deadline,"READINESS_TIMEOUT")
        time.sleep(.25)
    phase(layout,state,"starting-worker");started=int(time.time()*1000)
    command(["systemctl","start",SERVICES[1]])
    deadline=time.monotonic()+45
    while True:
        hb=db.ask("heartbeat",since=started-60000,startedAt=started)
        require(hb["count"]<=1,"DUPLICATE_WORKER")
        if hb["fresh"]:break
        require(time.monotonic()<deadline,"WORKER_HEARTBEAT_TIMEOUT")
        time.sleep(.5)
    smoke(layout,rid,state,auth,db,started)
def active_guard(service):
    require(service in SERVICES,"GUARD_SERVICE")
    g=read_json(Path("/opt/traceflow/release-guard.json"))
    require(g.get("phase") not in ("migration-complete","migration-recovered"),"POST_MIGRATION_ACTIVATION_REQUIRED")
    current=Path("/opt/traceflow/current")
    require(current.is_symlink(),"GUARD_CURRENT")
    rid=g.get("current") if g["status"]=="idle" else g.get("target")
    release_id(rid or "")
    require(os.readlink(current)=="/opt/traceflow/releases/"+rid,"GUARD_RELEASE")
    if g["status"]!="idle":
        require(g["status"]=="in-progress" and g.get("bootId")==boot_id() and proc_start(g["pid"])==g["processStart"],"INTERRUPTED_OPERATION")
        allowed={"starting-api","starting-worker"}
        require(g.get("phase") in allowed and (service!=SERVICES[1] or g["phase"]=="starting-worker"),"GUARD_PHASE")

def activate(layout,args,operation):
    native_context(layout);rid=release_id(args.release_id)
    auth=authorization(layout,args.authorization,operation,rid,args.digest)
    with exclusive_lock(layout.state/"operation.lock"):
        state=layout.load()
        if operation=="recover":
            require(state.get("phase") not in ("migration","migration-failed"),"USE_MIGRATION_RECOVERY")
            require(state["status"] in ("in-progress","intervention-required"),"NO_INTERRUPTED_OPERATION")
            previous=state.get("previousCurrent");previous_web=state.get("previousWeb")
            # First installation has no previous release. Only an explicit recovery of the
            # same prepared target is allowed; normal updates recover the approved predecessor.
            require(previous==rid or (previous is None and state.get("target")==rid and
                    state.get("phase") not in ("migration","migration-failed")),"RECOVERY_TARGET")
            old=dict(state,current=previous,web=previous_web,status="idle")
        else:
            require(state["status"]=="idle","RECOVERY_REQUIRED");layout.current_matches(state)
            old=json.loads(json.dumps(state));previous=state["current"];previous_web=state["web"]
            if operation=="rollback":require(rid==state.get("previous"),"ROLLBACK_NOT_PROTECTED_PREVIOUS")
        release,admin,manifest=layout.installed(rid,args.digest)
        require(layout.lab or manifest["sourceState"]=="committed","CANDIDATE_NOT_DEPLOYABLE")
        require(operation=="recover" or rid!=state.get("current") or state.get("phase") in ("migration-complete","migration-recovered"),"ALREADY_ACTIVE_USE_SMOKE")
        with Database(release,admin,args.authorization,"read") as db:
            # Read-only checks, including drift, before stopping the active release.
            before=db.ask("compatible")
            if previous:
                _,_,pm=layout.installed(previous)
                require(pm["schema"]==manifest["schema"],"ROLLBACK_SCHEMA_NOT_PROVEN")
            new_web=generation(layout,rid,state)
            state.update(status="in-progress",target=rid,previousCurrent=previous,previousWeb=previous_web,
                         operation=operation,bootId=boot_id(),pid=os.getpid(),processStart=proc_start(os.getpid()))
            phase(layout,state,"stopping")
            try:
                stop_services();db.ask("check")
                phase(layout,state,"switching")
                switch_link(layout.app/"current",release)
                switch_link(layout.web/"current",layout.generations/new_web/"dist")
                state["web"]=new_web
                phase(layout,state,"switched")
                layout.installed(rid,args.digest);db.ask("compatible")
                start_services(layout,state,rid,auth,db)
                state["history"].setdefault(rid,{})["lastActivated"]=now()
                state.update(status="idle",current=rid,previous=previous if previous!=rid else old.get("previous"),phase="complete")
                layout.save(state);emit("release_activated",releaseId=rid,schemaFingerprint=before["fingerprint"])
            except BaseException:
                stop_services()
                # Only exact schema contract + fresh drift + immutable old content permits compensation.
                try:
                    require(previous is not None,"FIRST_DEPLOY_NO_PREVIOUS")
                    _,_,pm=layout.installed(previous)
                    require(pm["schema"]==manifest["schema"],"ROLLBACK_SCHEMA_NOT_PROVEN")
                    db.ask("compatible")
                    restored_web=generation(layout,previous,state)
                    state.update(target=previous,web=restored_web)
                    phase(layout,state,"switching-back")
                    switch_link(layout.app/"current",layout.releases/previous)
                    switch_link(layout.web/"current",layout.generations/restored_web/"dist")
                    start_services(layout,state,previous,auth,db)
                    state.update(status="idle",current=previous,previous=old.get("previous"),phase="rolled-back")
                    layout.save(state);emit("activation_compensated",releaseId=previous)
                except BaseException:
                    state.update(status="intervention-required",phase="stopped");layout.save(state)
                    emit("manual_recovery_required",servicesStopped=True)
                raise

def migrate(layout,args):
    native_context(layout,allow_lab_root=True);rid=release_id(args.release_id)
    operation=getattr(args,"action","migrate")
    require(operation in ("migrate","migrate-initial"),"MIGRATION_OPERATION")
    auth=authorization(layout,args.authorization,operation,rid,args.digest)
    initial=operation=="migrate-initial"
    with exclusive_lock(layout.state/"operation.lock"):
        state=layout.load();require(state["status"]=="idle","RECOVERY_REQUIRED")
        layout.current_matches(state)
        if initial:
            require(state.get("current") is None and state.get("previous") is None and not state.get("history") and
                    state.get("phase") not in ("migration-complete","migration-recovered"),"INITIAL_RELEASE_STATE")
        assert_stopped()
        release,admin,manifest=layout.installed(rid,args.digest)
        # Identity, lock and preconditions are checked before a migration journal is opened.
        with Database(release,admin,args.authorization,"migrate") as db:
            db.ask("prepare-migration")
            state.update(status="in-progress",phase="migration",target=rid,previousCurrent=state["current"],
                         previousWeb=state["web"],bootId=boot_id(),pid=os.getpid(),processStart=proc_start(os.getpid()),
                         migrationKind="initial" if initial else "upgrade", descriptorSha256=args.digest,
                         chainSha256=manifest["schema"]["chainSha256"], authorizationId=auth.get("authorizationId"),
                         initialRecovery=auth.get("initialization",{}).get("recovery"))
            layout.save(state)
            try:
                result=db.ask("migrate")
                db.close()  # A receipt must not acknowledge an unclosed migration session.
                atomic_json(layout.state/("migration-"+uuid.uuid4().hex+".json"),{"releaseId":rid,**result,
                    "descriptorSha256":args.digest,"authorizationId":auth.get("authorizationId"),
                    "initialRecovery":state.get("initialRecovery"),"finishedAt":now()})
                state.update(status="idle",phase="migration-complete");layout.save(state)
                emit("migration_complete",**result)
            except BaseException:
                state.update(status="intervention-required",phase="migration-failed");layout.save(state)
                emit("migration_failed",servicesStopped=True,manualReviewRequired=True);raise

def recover_migration(layout,args):
    native_context(layout);rid=release_id(args.release_id)
    auth=authorization(layout,args.authorization,"recover-migration",rid,args.digest)
    with exclusive_lock(layout.state/"operation.lock"):
        state=layout.load()
        require(state["status"] in ("in-progress","intervention-required") and
                state.get("phase") in ("migration","migration-failed"),"NO_MIGRATION_RECOVERY")
        require(state.get("target")==rid and state.get("descriptorSha256")==args.digest,"RECOVERY_TARGET")
        require(auth.get("migrationKind")==state.get("migrationKind"),"RECOVERY_KIND")
        if state.get("migrationKind")=="initial":
            require(auth.get("initialRecovery")==state.get("initialRecovery") and state.get("initialRecovery"),"INITIAL_RECOVERY_PLAN_REQUIRED")
        assert_stopped()
        release,admin,manifest=layout.installed(rid,args.digest)
        require(manifest["schema"]["chainSha256"]==state.get("chainSha256"),"RECOVERY_CHAIN")
        with Database(release,admin,args.authorization,"read") as db:result=db.ask("compatible")
        # Read-only recovery can acknowledge an already complete and verified schema.
        # Failed Prisma history, drift or partial chains remain blocked for assisted recovery.
        state.update(status="idle",phase="migration-recovered")
        layout.save(state)
        emit("migration_recovered",schemaFingerprint=result["fingerprint"],servicesStarted=False,ddlExecuted=False)

def used_releases(layout):
    used=set()
    if platform.system()!="Linux":return used
    prefix=str(layout.releases)+"/"
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():continue
        try:
            paths=[]
            for name in ("cwd","exe"):
                try:paths.append(os.readlink(proc/name))
                except FileNotFoundError:pass
            for fd in (proc/"fd").iterdir():
                try:paths.append(os.readlink(fd))
                except FileNotFoundError:pass
            paths.append((proc/"maps").read_text())
            for rid in re.findall(re.escape(prefix)+r"([^/\s]+)", "\n".join(paths)):used.add(rid)
        except (FileNotFoundError,ProcessLookupError):pass
        except PermissionError:raise Refused("PROCESS_INVENTORY_DENIED")
    return used
def prune(layout,args):
    require(args.days>=7 and args.keep>=3,"RETENTION_MINIMUM")
    with exclusive_lock(layout.state/"operation.lock"):
        state=layout.load();require(state["status"]=="idle","RECOVERY_REQUIRED");layout.current_matches(state)
        protected={state.get("current"),state.get("previous")} | used_releases(layout)
        newest=sorted(state["history"],key=lambda r:state["history"][r]["lastActivated"],reverse=True)[:args.keep]
        protected.update(newest);candidates=[]
        for rid,info in state["history"].items():
            release_id(rid)
            if rid in protected or now()-info["lastActivated"]<args.days*86400:continue
            layout.installed(rid);candidates.append(rid)
        if args.apply:
            require(shutil.rmtree.avoids_symlink_attacks,"SAFE_RMTREE_REQUIRED")
            for rid in candidates:
                # Protected parents + shared flock + root ownership form the administrative boundary.
                shutil.rmtree(layout.releases/rid);shutil.rmtree(layout.admin/rid)
                (layout.catalog/(rid+".json")).unlink();del state["history"][rid]
            layout.save(state)
        emit("prune_plan",apply=args.apply,releases=candidates,publicGenerationsPreserved=True)

def main():
    p=argparse.ArgumentParser();p.add_argument("--root",default="/")
    sub=p.add_subparsers(dest="action",required=True)
    sub.add_parser("init");sub.add_parser("status")
    guard=sub.add_parser("guard");guard.add_argument("service")
    for name in ("verify","stage"):
        s=sub.add_parser(name);s.add_argument("--descriptor",required=True);s.add_argument("--digest",required=True)
    for name in ("activate","rollback","recover","migrate","migrate-initial","smoke","inspect-schema","inspect-initial-schema","recover-migration"):
        s=sub.add_parser(name);s.add_argument("--release-id",required=True);s.add_argument("--digest",required=True);s.add_argument("--authorization",required=True)
    s=sub.add_parser("prune");s.add_argument("--days",type=int,default=7);s.add_argument("--keep",type=int,default=3);s.add_argument("--apply",action="store_true")
    args=p.parse_args()
    if args.action=="guard":active_guard(args.service);return
    if args.action=="verify":
        d=descriptor(Path(args.descriptor).absolute(),args.digest)
        with tempfile.TemporaryDirectory(prefix="tf-verify-") as t:
            for k in ("runtime","admin"):
                dest=Path(t)/k;dest.mkdir()
                extract_verified(Path(args.descriptor).parent/d["artifacts"][k]["file"],dest,k,d["artifacts"][k]["manifestSha256"])
        emit("artifact_verified",releaseId=d["releaseId"]);return
    layout=Layout(args.root)
    if args.action=="init":layout.initialize();emit("layout_initialized");return
    if args.action=="status":emit("release_status",**layout.load());return
    if args.action=="stage":stage(layout,args.descriptor,args.digest);return
    if args.action=="prune":prune(layout,args);return
    if args.action in ("migrate","migrate-initial"):migrate(layout,args);return
    if args.action=="recover-migration":recover_migration(layout,args);return
    if args.action in ("activate","rollback","recover"):activate(layout,args,args.action);return
    native_context(layout,allow_lab_root=args.action in ("inspect-schema","inspect-initial-schema"))
    auth=authorization(layout,args.authorization,args.action,args.release_id,args.digest)
    with exclusive_lock(layout.state/"operation.lock"):
        release,admin,_=layout.installed(args.release_id,args.digest)
        initial=args.action=="inspect-initial-schema"
        if initial:
            state=layout.load();require(state["status"]=="idle" and state.get("current") is None and not state.get("history"),"INITIAL_RELEASE_STATE")
            assert_stopped()
        with Database(release,admin,args.authorization,"migrate" if initial else "read") as db:
            if args.action in ("inspect-schema","inspect-initial-schema"):
                emit("schema_snapshot",**db.ask("initial-snapshot" if initial else "snapshot"))
            else:
                state=layout.load();require(state["status"]=="idle" and state["current"]==args.release_id,"NOT_CURRENT")
                layout.current_matches(state);smoke(layout,args.release_id,state,auth,db,int(time.time()*1000)-60000)
                emit("release_smoke",status="PASS")

if __name__=="__main__":
    def interrupted(_signum,_frame):raise Refused("OPERATION_INTERRUPTED")
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    try:main()
    except (Refused,OSError,ValueError,KeyError,subprocess.TimeoutExpired) as e:
        emit("operation_refused",code=str(e) if isinstance(e,Refused) else type(e).__name__)
        sys.exit(1)
