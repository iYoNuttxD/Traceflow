#!/usr/bin/env python3
"""Only a token-marked disposable lima-tf05 VM. Never run on an existing server."""
import argparse
import contextlib
from types import SimpleNamespace
from urllib.parse import quote, urlunsplit
from unittest import mock
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
OFFICIAL_MIGRATION_COUNT=68  # 67 reviewed migrations plus the additive upload ledger.
sys.path.insert(0,str(ROOT/"deploy/lib"))
import release_contract as c
spec=importlib.util.spec_from_file_location("release_ops",ROOT/"deploy/scripts/release.py")
ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
LAB=Path("/var/tmp/tf05-lab")
RESULTS=[]
REPORT_RUN=str(time.time_ns())
def run(args,env=None,input=None,check=True,timeout=600):
    r=subprocess.run(args,input=input,text=True,capture_output=True,env=env,timeout=timeout)
    if check and r.returncode:
        # Our operational CLI returns only bounded event/code JSON, never credential values.
        safe=r.stdout if Path(args[0]).name=="python3" else ""
        raise RuntimeError("command failed: "+Path(args[0]).name+" "+safe[-2000:])
    return r
def case(name,ok=True):
    RESULTS.append({"case":name,"status":"PASS" if ok else "FAIL"})
    print(name,RESULTS[-1]["status"],flush=True)
    if not ok:raise AssertionError(name)
def save():
    record={"cases":RESULTS,"ociAccess":False,"productionSecrets":False}
    c.atomic_json(LAB/"results.json",record)
    directory=LAB/"reports";directory.mkdir(mode=0o700,exist_ok=True)
    c.atomic_json(directory/(REPORT_RUN+".json"),record)
def guard():
    c.require(os.geteuid()==0 and socket.gethostname()=="lima-tf05","DISPOSABLE_VM_REQUIRED")
    marker=c.private_json(Path("/run/traceflow-oci05-disposable"))
    c.require(marker["token"]==os.environ.get("TF_RELEASE_LAB_TOKEN"),"DISPOSABLE_VM_TOKEN")
    c.require(run(["systemd-detect-virt"]).stdout.strip() not in ("","none"),"VIRTUALIZATION")
    return marker["token"]
def context():
    data=c.private_json(LAB/"context.json")
    env={"PATH":"/usr/bin:/bin:/usr/sbin:/sbin","LANG":"C.UTF-8","PYTHONDONTWRITEBYTECODE":"1","TF_RELEASE_LAB_TOKEN":guard(),
         "TEST_DATABASE_URL":data["migrationUrl"],"TEST_RUNTIME_DATABASE_URL":data["runtimeUrl"]}
    return data,env
def cli(action,rid=None,digest=None,auth=None,env=None,check=True,**kwargs):
    args=["python3",str(ROOT/"deploy/scripts/release.py"),action]
    for key,value in {"release-id":rid,"digest":digest,"authorization":auth,**kwargs}.items():
        if value is not None:args.extend(["--"+key,str(value)])
    return run(args,env=env or context()[1],check=check)
def json_last(result):
    return json.loads(result.stdout.strip().splitlines()[-1])
def auth(data,release,digest,operation="activate",**extra):
    result={"formatVersion":1,"environment":"disposable","releaseId":release,"descriptorSha256":digest,"operation":operation,
      "expiresAt":(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=2)).isoformat(),
      "target":data["target"],"gates":{"writersControlled":True,"backupVerified":True,"restoreRehearsed":True},
      "backupReference":"synthetic-disposable-no-business-data","frontend":{"url":"https://traceflow.dev","caFile":"/etc/nginx/ssl/traceflow-origin.pem"}}
    if data.get("schemaFingerprint"):result["expectedSchemaFingerprint"]=data["schemaFingerprint"]
    result.update(extra)
    path=LAB/("auth-"+secrets.token_hex(6)+".json");c.atomic_json(path,result)
    return path
def mysql(data,sql,role="migration",check=True):
    url=data[role+"Url"]
    from urllib.parse import urlsplit
    u=urlsplit(url)
    env={"PATH":"/usr/bin:/bin","MYSQL_PWD":u.password}
    return run([data["mysql"],"--no-defaults","--no-login-paths","--protocol=TCP","--host=127.0.0.1",
      "--port="+str(u.port),"--user="+u.username,"--batch","--raw","--skip-column-names",u.path[1:]],env=env,input=sql,check=check)
def owned_database_url(user,password,port,schema):
    return urlunsplit(("mysql",quote(user,safe="")+":"+quote(password,safe="")+"@127.0.0.1:"+str(port),"/"+schema,"",""))

def setup(build):
    token=guard();c.require(not LAB.exists(),"LAB_ALREADY_EXISTS")
    LAB.mkdir(mode=0o700)
    base=Path("/tmp/tf05-tools/mysql-8.4.8-linux-glibc2.28-aarch64")
    run_id=secrets.token_hex(6);schema="tf_oci_"+run_id+"_test";owner=schema.replace("_test","_owner")
    migrate_user="tf_m_"+run_id;runtime_user="tf_r_"+run_id
    password=secrets.token_hex(32);runtime_password=secrets.token_hex(32);owner_token=secrets.token_hex(32)
    s=socket.socket();s.bind(("127.0.0.1",0));port=s.getsockname()[1];s.close()
    while port<49152:
        s=socket.socket();s.bind(("127.0.0.1",0));port=s.getsockname()[1];s.close()
    datadir=LAB/"mysql-data"
    run([str(base/"bin/mysqld"),"--no-defaults","--initialize-insecure","--user=root","--basedir="+str(base),"--datadir="+str(datadir),"--mysqlx=OFF"])
    bootstrap=LAB/"bootstrap.sql"
    root_password=secrets.token_hex(32)
    sql="\n".join([
      "ALTER USER 'root'@'localhost' IDENTIFIED BY '"+root_password+"';",
      "CREATE DATABASE \x60"+schema+"\x60 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
      "CREATE DATABASE \x60"+owner+"\x60;",
      "CREATE TABLE \x60"+owner+"\x60.RunOwner (id INT PRIMARY KEY, token CHAR(64) NOT NULL);",
      "INSERT INTO \x60"+owner+"\x60.RunOwner VALUES (1,'"+owner_token+"');",
      "CREATE USER '"+migrate_user+"'@'127.0.0.1' IDENTIFIED BY '"+password+"';",
      "CREATE USER '"+runtime_user+"'@'127.0.0.1' IDENTIFIED BY '"+runtime_password+"';",
      "GRANT ALL PRIVILEGES ON \x60"+schema+"\x60.* TO '"+migrate_user+"'@'127.0.0.1';",
      "GRANT SELECT ON \x60"+owner+"\x60.* TO '"+migrate_user+"'@'127.0.0.1';",
      "GRANT SELECT,INSERT,UPDATE,DELETE ON \x60"+schema+"\x60.* TO '"+runtime_user+"'@'127.0.0.1';",
      "GRANT SELECT ON \x60"+owner+"\x60.* TO '"+runtime_user+"'@'127.0.0.1';"])
    bootstrap.write_text(sql);bootstrap.chmod(0o600)
    proc=subprocess.Popen([str(base/"bin/mysqld"),"--no-defaults","--user=root","--basedir="+str(base),"--datadir="+str(datadir),
      "--port="+str(port),"--bind-address=127.0.0.1","--skip-name-resolve","--mysqlx=OFF","--skip-log-bin",
      "--innodb-buffer-pool-size=134217728","--default-time-zone=+00:00","--socket="+str(LAB/"mysql.sock"),
      "--pid-file="+str(LAB/"mysql.pid"),"--log-error="+str(LAB/"mysql.log"),"--init-file="+str(bootstrap)],
      stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    data={"mysql":str(base/"bin/mysql"),"serverPid":proc.pid,"rootPassword":root_password,
          "migrationUrl":owned_database_url(migrate_user,password,port,schema),
          "runtimeUrl":owned_database_url(runtime_user,runtime_password,port,schema)}
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        c.require(proc.poll() is None,"OWNED_MYSQL_START")
        r=mysql(data,"SELECT JSON_OBJECT('uuid',@@server_uuid,'dir',@@datadir,'version',VERSION());",check=False)
        if r.returncode==0:break
        time.sleep(.2)
    c.require(r.returncode==0,"OWNED_MYSQL_TIMEOUT");identity=json.loads(r.stdout)
    c.require(int((LAB/"mysql.pid").read_text())==proc.pid and identity["dir"].rstrip("/")==str(datadir),"OWNED_MYSQL_IDENTITY")
    uuid=(datadir/"auto.cnf").read_text().split("server-uuid=")[1].strip()
    c.require(uuid==identity["uuid"] and identity["version"]=="8.4.8","OWNED_MYSQL_UUID")
    data["target"]={"host":"127.0.0.1","port":port,"schema":schema,"serverUuid":uuid,"version":"8.4.8","datadir":str(datadir),
      "ownerHash":hashlib.sha256(owner_token.encode()).hexdigest(),"runtimeUser":runtime_user,"migrationUser":migrate_user}
    bootstrap.unlink();c.atomic_json(LAB/"context.json",data)
    case("owned-mysql-identity-and-no-admin-access",mysql(data,"SELECT COUNT(*) FROM mysql.user;",check=False).returncode!=0)
    case("runtime-DDL-denied",mysql(data,"CREATE TABLE forbidden_fixture(id INT);","runtime",False).returncode!=0)
    if run(["id","traceflow"],check=False).returncode:run(["useradd","--system","--user-group","--shell","/sbin/nologin","--no-create-home","traceflow"])
    run(["python3",str(ROOT/"deploy/scripts/prepare-runtime-directories.py"),"--apply"])
    values=json.loads(run(["node","--input-type=module","-e","import { productionEnvironment } from '"+str(ROOT/"backend/test/helpers/production-environment.js")+"';process.stdout.write(JSON.stringify(productionEnvironment()));"]).stdout)
    values.update(DATABASE_URL=data["runtimeUrl"],FRONTEND_URL="https://traceflow.dev",CORS_ALLOWED_ORIGINS="https://traceflow.dev",
                  GITHUB_SCHEDULER_TICK_MS="1000",TEST_EVIDENCE_STORAGE_DIR="/var/lib/traceflow/test-evidence")
    fixed={"NODE_ENV","HTTP_HOST","PORT","TRUST_PROXY","GITHUB_SCHEDULER_ENABLED","SHUTDOWN_TIMEOUT_MS"}
    cfg=Path("/etc/traceflow")
    for name,content in (("runtime.env","\n".join(k+"="+v for k,v in values.items() if k not in fixed)+"\n"),("api.env",""),("github-worker.env","")):
        p=cfg/name;p.write_text(content);p.chmod(0o600)
    certs=Path("/etc/nginx/ssl");certs.mkdir(mode=0o700,exist_ok=True)
    run(["openssl","req","-x509","-newkey","rsa:2048","-nodes","-keyout",str(certs/"traceflow-origin.key"),"-out",str(certs/"traceflow-origin.pem"),
         "-days","1","-subj","/CN=traceflow.dev","-addext","subjectAltName=DNS:traceflow.dev"])
    (certs/"traceflow-origin.key").chmod(0o600)
    for service in ops.SERVICES:
        shutil.copyfile(ROOT/"deploy/systemd"/service,Path("/etc/systemd/system")/service)
        drop=Path("/etc/systemd/system")/(service+".d");drop.mkdir(exist_ok=True)
        shutil.copyfile(ROOT/"deploy/systemd/traceflow-release-guard.conf",drop/"release-guard.conf")
        (drop/"test-network.conf").write_text("[Service]\nIPAddressDeny=any\nIPAddressAllow=localhost\n")
    run(["restorecon","-R","/etc/systemd/system","/etc/traceflow","/etc/nginx/ssl","/var/lib/traceflow"])
    run(["systemctl","daemon-reload"])
    env=context()[1];cli("init",env=env)
    descriptor=Path(build)/"release.json";checksum=c.file_digest(descriptor);rid=c.read_json(descriptor)["releaseId"]
    cli("stage",digest=checksum,descriptor=str(descriptor),env=env)
    data.update(releaseA=rid,digestA=checksum,build=build)
    c.atomic_json(LAB/"context.json",data)
    case("R1-real-ARM64-artifact-staged")
    case("R6-repeat-stage-refused",cli("stage",digest=checksum,descriptor=str(descriptor),env=env,check=False).returncode!=0)
    schema_auth=auth(data,rid,checksum,"inspect-schema")
    snap=json_last(cli("inspect-schema",rid,checksum,schema_auth,env))["fingerprint"]
    c.require(json_last(cli("inspect-schema",rid,checksum,schema_auth,env))["tableCount"]==0,"EMPTY_OWNED_SCHEMA")
    migrate_auth=auth(data,rid,checksum,"migrate",beforeFingerprint=snap)
    first=json_last(cli("migrate",rid,checksum,migrate_auth,env))
    data["schemaFingerprint"]=first["fingerprint"];c.atomic_json(LAB/"context.json",data)
    case("official-migrations-via-separated-job",len(first["applied"])==OFFICIAL_MIGRATION_COUNT)
    second=json_last(cli("migrate",rid,checksum,auth(data,rid,checksum,"migrate",beforeFingerprint=data["schemaFingerprint"]),env))
    case("migration-idempotence",second["applied"]==[])
    initial_activation(data,env)

def initial_activation(data,env):
    rid=data["releaseA"];checksum=data["digestA"]
    # Prepare the existing OCI-04 ingress, with a lab-only trusted loopback peer.
    snippets=Path("/etc/nginx/traceflow");snippets.mkdir(exist_ok=True)
    for p in (ROOT/"deploy/nginx/snippets").iterdir():shutil.copyfile(p,snippets/p.name)
    cf=snippets/"cloudflare.conf"
    cf.write_text(cf.read_text().replace("    default 0;","    default 0;\n    127.0.0.2/32 1;")+"\nset_real_ip_from 127.0.0.2/32;\n")
    shutil.copyfile(ROOT/"deploy/nginx/traceflow.conf","/etc/nginx/conf.d/traceflow.conf")
    Path("/etc/nginx/nginx.conf").write_text("user nginx;\nworker_processes 1;\npid /run/nginx.pid;\nevents { worker_connections 1024; }\nhttp { include /etc/nginx/mime.types; default_type application/octet-stream; include /etc/nginx/conf.d/traceflow.conf; }\n")
    run(["bash",str(ROOT/"deploy/scripts/configure-selinux.sh"),"--apply"])
    run(["restorecon","-R","/etc/nginx","/var/www/traceflow"])
    run(["nginx","-t"]);run(["systemctl","start","nginx"])
    sentinel=Path("/var/lib/traceflow/test-evidence/tf05-preserved.txt");sentinel.write_text("synthetic-private-evidence");sentinel.chmod(0o600)
    run(["chown","traceflow:traceflow",str(sentinel)])
    cli("activate",rid,checksum,auth(data,rid,checksum),env)
    case("actual-api-worker-nginx-readiness-heartbeat-and-sandbox")
    cli("smoke",rid,checksum,auth(data,rid,checksum,"smoke"),env)
    case("read-only-application-smoke")
    save()

def resume_setup(build):
    data,env=context()
    descriptor=Path(build)/"release.json";checksum=c.file_digest(descriptor);rid=c.read_json(descriptor)["releaseId"]
    cli("stage",digest=checksum,descriptor=str(descriptor),env=env)
    schema_auth=auth(data,rid,checksum,"inspect-schema")
    snapshot=json_last(cli("inspect-schema",rid,checksum,schema_auth,env))
    data.update(releaseA=rid,digestA=checksum,build=build,schemaFingerprint=snapshot["fingerprint"])
    c.atomic_json(LAB/"context.json",data)
    cli("recover-migration",rid,checksum,auth(data,rid,checksum,"recover-migration"),env)
    case("read-only-recovery-after-complete-migration-no-history-edit")
    second=json_last(cli("migrate",rid,checksum,auth(data,rid,checksum,"migrate",beforeFingerprint=data["schemaFingerprint"]),env))
    case("migration-idempotence",second["applied"]==[])
    initial_activation(data,env)

def mysql_root(data,sql,check=True):
    guard()
    c.require(str(LAB/"mysql-data").encode() in Path("/proc",str(data["serverPid"]),"cmdline").read_bytes(),"MYSQL_OWNER")
    return run([data["mysql"],"--no-defaults","--no-login-paths","--socket="+str(LAB/"mysql.sock"),"--user=root","--batch","--raw","--skip-column-names"],
      env={"PATH":"/usr/bin:/bin","MYSQL_PWD":data["rootPassword"]},input=sql,check=check)

def fresh_target(data):
    from urllib.parse import urlsplit
    run_id=secrets.token_hex(6);schema="tf_oci_"+run_id+"_test";owner=schema.replace("_test","_owner")
    user="tf_m_"+run_id;reader="tf_r_"+run_id;pw=secrets.token_hex(32);rpw=secrets.token_hex(32);nonce=secrets.token_hex(32)
    statements=[
      "CREATE DATABASE \x60"+schema+"\x60 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
      "CREATE DATABASE \x60"+owner+"\x60;",
      "CREATE TABLE \x60"+owner+"\x60.RunOwner (id INT PRIMARY KEY,token CHAR(64));",
      "INSERT INTO \x60"+owner+"\x60.RunOwner VALUES(1,'"+nonce+"');",
      "CREATE USER '"+user+"'@'127.0.0.1' IDENTIFIED BY '"+pw+"';",
      "CREATE USER '"+reader+"'@'127.0.0.1' IDENTIFIED BY '"+rpw+"';",
      "GRANT ALL PRIVILEGES ON \x60"+schema+"\x60.* TO '"+user+"'@'127.0.0.1';",
      "GRANT SELECT ON \x60"+owner+"\x60.* TO '"+user+"'@'127.0.0.1';",
      "GRANT SELECT,INSERT,UPDATE,DELETE ON \x60"+schema+"\x60.* TO '"+reader+"'@'127.0.0.1';",
      "GRANT SELECT ON \x60"+owner+"\x60.* TO '"+reader+"'@'127.0.0.1';"]
    mysql_root(data,"\n".join(statements))
    port=data["target"]["port"]
    d=dict(data,target=dict(data["target"],schema=schema,migrationUser=user,runtimeUser=reader,ownerHash=hashlib.sha256(nonce.encode()).hexdigest()),
      migrationUrl=owned_database_url(user,pw,port,schema),
      runtimeUrl=owned_database_url(reader,rpw,port,schema))
    d.pop("schemaFingerprint",None)
    return d

def alternate_layout(data):
    root=LAB/("migration-"+secrets.token_hex(5));root.mkdir(mode=0o700)
    c.atomic_json(root/".traceflow-release-lab.json",{"token":guard()})
    for name in ("opt/traceflow/releases","opt/traceflow/shared","var/www/traceflow"):(root/name).mkdir(parents=True,exist_ok=True)
    layout=ops.Layout(str(root));layout.initialize()
    ops.stage(layout,data["build"]+"/release.json",data["digestA"])
    return layout
def migration_cases(data,env):
    ops.stop_services()
    d=fresh_target(data);layout=alternate_layout(d)
    e=dict(env,TEST_DATABASE_URL=d["migrationUrl"],TEST_RUNTIME_DATABASE_URL=d["runtimeUrl"])
    rid=data["releaseA"];checksum=data["digestA"]
    release,admin,_=layout.installed(rid)
    inspect=auth(d,rid,checksum,"inspect-schema")
    with mock_env(e),ops.Database(release,admin,inspect,"read") as db:before=db.ask("snapshot")
    ap=auth(d,rid,checksum,"migrate",beforeFingerprint=before["fingerprint"])
    args=SimpleNamespace(release_id=rid,digest=checksum,authorization=str(ap))
    # Explicit guards exercise the production migration function on an owned alternate layout.
    with mock_env(dict(e,TEST_DATABASE_URL="")):
        try:ops.migrate(layout,args);case("R17-missing-test-url",False)
        except c.Refused as failure:case("R17-missing-test-url","TEST_DATABASE_URL" in str(failure))
    bad=dict(e,TEST_DATABASE_URL=d["migrationUrl"].replace("127.0.0.1","10.20.2.25"))
    with mock_env(bad):
        try:ops.migrate(layout,args);case("R16-protected-host-refused",False)
        except c.Refused as failure:case("R16-protected-host-refused",str(failure)=="TARGET_MISMATCH")
    with mock_env(e),c.exclusive_lock(layout.state/"operation.lock"):
        try:ops.migrate(layout,args);case("R20-filesystem-mutex",False)
        except c.Refused as failure:case("R20-filesystem-mutex",str(failure)=="OPERATION_LOCKED")
    with mock_env(e),ops.Database(release,admin,ap,"migrate") as db:
        db.ask("prepare-migration")
        try:ops.migrate(layout,args);case("R15-database-session-mutex",False)
        except c.Refused as failure:case("R15-database-session-mutex",str(failure)=="DATABASE_OPERATION_LOCKED")
    with mock_env(e):ops.migrate(layout,args)
    with mock_env(e),ops.Database(release,admin,inspect,"read") as db:after=db.ask("snapshot")
    case("full-job-official-migrations-from-empty",len(after["applied"])==OFFICIAL_MIGRATION_COUNT)
    ap=auth(d,rid,checksum,"migrate",beforeFingerprint=after["fingerprint"])
    with mock_env(e):ops.migrate(layout,SimpleNamespace(release_id=rid,digest=checksum,authorization=str(ap)))
    case("full-job-idempotent-second-run")
    # Real schema drift, in an exclusively owned schema, never by changing migration SQL/history.
    mysql(d,"ALTER TABLE Project ADD COLUMN tf05_drift_probe INT NULL;")
    with mock_env(e):
        try:ops.migrate(layout,SimpleNamespace(release_id=rid,digest=checksum,authorization=str(ap)));case("schema-drift-blocks-job",False)
        except c.Refused as failure:case("schema-drift-blocks-job",str(failure)=="SCHEMA_BEFORE_MISMATCH")
    # Partial SQL failure after preflight: revoke ALTER only on a second disposable schema.
    f=fresh_target(data);failed_layout=alternate_layout(f)
    fe=dict(env,TEST_DATABASE_URL=f["migrationUrl"],TEST_RUNTIME_DATABASE_URL=f["runtimeUrl"])
    release,admin,_=failed_layout.installed(rid)
    inspect=auth(f,rid,checksum,"inspect-schema")
    with mock_env(fe),ops.Database(release,admin,inspect,"read") as db:snap=db.ask("snapshot")
    ap=auth(f,rid,checksum,"migrate",beforeFingerprint=snap["fingerprint"])
    original=ops.Database.ask
    def revoke_then_run(self,action,**fields):
        if action=="migrate":
            mysql_root(data,"REVOKE ALTER ON \x60"+f["target"]["schema"]+"\x60.* FROM '"+f["target"]["migrationUser"]+"'@'127.0.0.1';")
        return original(self,action,**fields)
    with mock_env(fe),mock.patch.object(ops.Database,"ask",revoke_then_run):
        try:ops.migrate(failed_layout,SimpleNamespace(release_id=rid,digest=checksum,authorization=str(ap)));case("R14-real-partial-migration-failure",False)
        except c.Refused as failure:case("R14-real-partial-migration-failure",str(failure)=="MIGRATION_FAILED")
    failed=int(mysql(f,"SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;").stdout.strip())
    case("R14-no-reset-no-following-migrations",failed==1 and failed_layout.load()["status"]=="intervention-required")
    with mock_env(fe):
        try:ops.migrate(failed_layout,SimpleNamespace(release_id=rid,digest=checksum,authorization=str(ap)));case("failed-job-reexecution-blocked",False)
        except c.Refused as failure:case("failed-job-reexecution-blocked",str(failure)=="RECOVERY_REQUIRED")
    case("runtime-DDL-still-denied",mysql(data,"CREATE TABLE forbidden_fixture_again(id INT);","runtime",False).returncode!=0)

@contextlib.contextmanager
def mock_env(env):
    with mock.patch.dict(os.environ,env,clear=True):yield

def fixture_variant(data,label,change):
    path=LAB/("fixture-"+secrets.token_hex(5));path.mkdir()
    manifest=c.read_json(Path(data["build"])/"release.json")
    old=data["releaseA"];rid=old[:-12]+secrets.token_hex(6)
    artifacts={}
    for kind in ("runtime","admin"):
        tree=path/kind;tree.mkdir()
        m=c.extract_verified(Path(data["build"])/(kind+".tar.gz"),tree,kind,manifest["artifacts"][kind]["manifestSha256"])
        m["releaseId"]=rid;m["checks"]["labFixture"]=label
        if kind=="runtime":change(tree)
        artifacts[kind]=c.pack(tree,path/(kind+".tar.gz"),m)
        shutil.rmtree(tree)
    d={"formatVersion":1,"releaseId":rid,"commitSha":manifest["commitSha"],"artifacts":artifacts}
    (path/"release.json").write_bytes(c.encoded(d))
    return rid,path,c.file_digest(path/"release.json")

def exercise(build_b):
    data,env=context();rid=data["releaseA"];checksum=data["digestA"]
    # Schema compatibility is checked before touching the active pointers.
    original=c.read_json(Path("/opt/traceflow/shared/release-state/state.json"))
    bad=dict(data,schemaFingerprint="0"*64)
    result=cli("smoke",rid,checksum,auth(bad,rid,checksum,"smoke"),env,check=False)
    case("R13-schema-fingerprint-mismatch-blocked",result.returncode!=0 and "SCHEMA_FINGERPRINT" in result.stdout)
    migration_cases(data,env)
    # Restart the original approved artifact after administrative tests; no schema of A changed.
    layout=ops.Layout("/")
    state=layout.load();state.update(status="in-progress",target=rid,bootId=ops.boot_id(),pid=os.getpid(),processStart=ops.proc_start(os.getpid()))
    layout.save(state)
    with mock_env(env),ops.Database(Path("/opt/traceflow/releases")/rid,Path("/opt/traceflow/administration")/rid,auth(data,rid,checksum),"read") as db:
        ops.start_services(layout,state,rid,json.loads(auth(data,rid,checksum).read_text()),db)
    state.update(status="idle",phase="complete");layout.save(state)
    # B is a complete Vite build with a documented harmless lab-only data attribute.
    descriptor=Path(build_b)/"release.json";bd=c.file_digest(descriptor);b=c.read_json(descriptor)["releaseId"]
    cli("stage",digest=bd,descriptor=str(descriptor),env=env)
    old_assets=set((Path("/var/www/traceflow/current")/"assets").iterdir())
    cli("activate",b,bd,auth(data,b,bd),env)
    case("A-to-B-real-systemd-activation")
    dist=Path("/var/www/traceflow/current")
    preserved=[p.name for p in old_assets if p.is_file() and ops.ASSET.fullmatch(p.name)]
    case("R22-prior-hashed-assets-retained",all((dist/"assets"/name).is_file() for name in preserved))
    b_index=c.file_digest(dist/"index.html")
    cli("rollback",rid,checksum,auth(data,rid,checksum,"rollback"),env)
    case("application-rollback-A-api-worker-assets",c.file_digest(dist/"index.html")!=b_index and all((dist/"assets"/name).is_file() for name in preserved))
    # Native loader negative control. New fixture artifact, never mutate a prepared release.
    broken,path,pdigest=fixture_variant(data,"invalid-engine",lambda tree:(tree/"backend/node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node").write_bytes(b"invalid fixture engine"))
    tree=LAB/"invalid-engine-extracted";tree.mkdir()
    dm=c.read_json(path/"release.json")
    c.extract_verified(path/"runtime.tar.gz",tree,"runtime",dm["artifacts"]["runtime"]["manifestSha256"])
    bad_native=run(["node",str(tree/"deploy/scripts/artifact-smoke.mjs"),str(tree)],check=False)
    case("R5-native-engine-refused",bad_native.returncode!=0 and "ARTIFACT_RUNTIME_UNAVAILABLE" in bad_native.stderr)
    # API crash with valid metadata forces verified compensation to A.
    failing,fp,fd=fixture_variant(data,"api-start-failure",lambda tree:(tree/"backend/src/server.js").write_text("process.exit(44);\n"))
    cli("stage",digest=fd,descriptor=str(fp/"release.json"),env=env)
    failed=cli("activate",failing,fd,auth(data,failing,fd),env,check=False)
    state=layout.load()
    case("R10-R12-readiness-failure-restores-A",failed.returncode!=0 and state["status"]=="idle" and state["current"]==rid)
    cli("smoke",rid,checksum,auth(data,rid,checksum,"smoke"),env)
    # Worker crash is separately observed through heartbeat, never accepted as active-only health.
    failing,fp,fd=fixture_variant(data,"worker-start-failure",lambda tree:(tree/"backend/src/github-worker.js").write_text("process.exit(45);\n"))
    cli("stage",digest=fd,descriptor=str(fp/"release.json"),env=env)
    failed=cli("activate",failing,fd,auth(data,failing,fd),env,check=False)
    state=layout.load()
    case("R11-worker-failure-restores-A",failed.returncode!=0 and state["status"]=="idle" and state["current"]==rid)
    case("R18-evidence-bytes-preserved",Path("/var/lib/traceflow/test-evidence/tf05-preserved.txt").read_text()=="synthetic-private-evidence")
    case("SELinux-remains-Enforcing",run(["getenforce"]).stdout.strip()=="Enforcing")
    data.update(releaseB=b,digestB=bd,buildB=build_b);c.atomic_json(LAB/"context.json",data)
    save()

def interruption_cases():
    data,env=context();layout=ops.Layout("/")
    rid=data["releaseA"];digest=data["digestA"];b=data["releaseB"];bd=data["digestB"]
    before=layout.load()
    with c.exclusive_lock(layout.state/"operation.lock"):
        blocked=cli("activate",b,bd,auth(data,b,bd),env,check=False)
    case("R20-second-activation-refused-with-live-mutex",blocked.returncode!=0 and "OPERATION_LOCKED" in blocked.stdout and layout.load()==before)
    # Kill the real staging process after its private workspace is created.
    candidate,package,checksum=fixture_variant(data,"abrupt-stage",lambda tree:None)
    child=subprocess.Popen(["python3",str(ROOT/"deploy/scripts/release.py"),"stage","--descriptor",str(package/"release.json"),"--digest",checksum],
        env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    old=set(layout.releases.glob(".stage-*"));found=set();deadline=time.monotonic()+30
    while time.monotonic()<deadline and child.poll() is None:
        found=set(layout.releases.glob(".stage-*"))-old
        if found:
            child.kill();break
        time.sleep(.01)
    child.wait(timeout=30)
    case("R23-SIGKILL-stage-never-approves-partial-release",bool(found) and child.returncode==-signal.SIGKILL and not (layout.catalog/(candidate+".json")).exists() and layout.load()==before)
    layout.current_matches(before)
    # Re-running staging uses a new private directory; never treats the orphan as approved.
    cli("stage",digest=checksum,descriptor=str(package/"release.json"),env=env)
    case("R23-fresh-stage-after-abrupt-interruption")
    # API failure after a successful activation is distinct from startup/readiness failure.
    cli("activate",b,bd,auth(data,b,bd),env)
    override=Path("/run/systemd/system/traceflow-api.service.d/99-tf05-failure.conf")
    override.parent.mkdir(parents=True,exist_ok=True);override.write_text("[Service]\nRestart=no\n")
    run(["systemctl","daemon-reload"])
    pid=int(ops.service_state(ops.SERVICES[0])["MainPID"])
    os.kill(pid,signal.SIGKILL)
    deadline=time.monotonic()+10
    while time.monotonic()<deadline and ops.service_state(ops.SERVICES[0]).get("MainPID")!="0":time.sleep(.1)
    case("R12-api-failure-after-completed-activation",ops.service_state(ops.SERVICES[0]).get("MainPID")=="0")
    override.unlink();run(["systemctl","daemon-reload"])
    cli("rollback",rid,digest,auth(data,rid,digest,"rollback"),env)
    case("R12-explicit-rollback-after-api-failure-with-compatible-schema",layout.load()["current"]==rid)
    cli("smoke",rid,digest,auth(data,rid,digest,"smoke"),env)
    save()

def final_candidate(build):
    data,env=context();layout=ops.Layout("/")
    descriptor=Path(build)/"release.json";digest=c.file_digest(descriptor);rid=c.read_json(descriptor)["releaseId"]
    repeat=Path(build+"-repeat")
    names=("release.json","runtime.tar.gz","admin.tar.gz")
    case("final-two-independent-builds-byte-identical",all(c.file_digest(Path(build)/n)==c.file_digest(repeat/n) for n in names))
    cli("verify",digest=digest,descriptor=str(descriptor),env=env)
    cli("stage",digest=digest,descriptor=str(descriptor),env=env)
    cli("activate",rid,digest,auth(data,rid,digest),env)
    case("final-artifact-real-api-worker-nginx-smoke")
    ops.stop_services()
    before=json_last(cli("inspect-schema",rid,digest,auth(data,rid,digest,"inspect-schema"),env))["fingerprint"]
    cli("migrate",rid,digest,auth(data,rid,digest,"migrate",beforeFingerprint=before),env)
    denied=run(["systemctl","start",*ops.SERVICES],check=False)
    case("post-migration-real-systemd-guard-blocks-unapproved-restart",denied.returncode!=0 and all(ops.service_state(s).get("MainPID")=="0" for s in ops.SERVICES))
    cli("activate",rid,digest,auth(data,rid,digest),env)
    case("post-migration-explicit-same-release-activation-and-smoke")
    cli("rollback",data["releaseA"],data["digestA"],auth(data,data["releaseA"],data["digestA"],"rollback"),env)
    case("final-artifact-verified-rollback-to-protected-A")
    cli("activate",rid,digest,auth(data,rid,digest),env)
    case("final-artifact-reactivation-idle-and-storage-preserved",layout.load()["status"]=="idle" and Path("/var/lib/traceflow/test-evidence/tf05-preserved.txt").read_text()=="synthetic-private-evidence")
    data.update(finalRelease=rid,finalDigest=digest,finalBuild=build);c.atomic_json(LAB/"context.json",data)
    save()

def negative_database_guards():
    data,env=context();layout=ops.Layout("/")
    rid=data["finalRelease"];digest=data["finalDigest"];release,admin,_=layout.installed(rid)
    original_state=layout.load()
    swapped=json.loads(json.dumps(data));swapped["target"]["migrationUser"]=data["target"]["runtimeUser"];swapped["target"]["runtimeUser"]=data["target"]["migrationUser"]
    restricted=dict(env,TEST_DATABASE_URL=data["runtimeUrl"])
    try:
        with mock_env(restricted),ops.Database(release,admin,auth(swapped,rid,digest,"migrate"),"migrate"):pass
        case("migration-insufficient-DDL-grants-refused-before-CLI",False)
    except c.Refused as failure:case("migration-insufficient-DDL-grants-refused-before-CLI",str(failure)=="MIGRATION_DDL_PRIVILEGE")
    wrong=json.loads(json.dumps(data));wrong["target"]["serverUuid"]="00000000-0000-0000-0000-000000000000"
    try:
        with mock_env(env),ops.Database(release,admin,auth(wrong,rid,digest,"migrate"),"migrate"):pass
        case("migration-wrong-server-UUID-refused",False)
    except c.Refused as failure:case("migration-wrong-server-UUID-refused",str(failure)=="SERVER_IDENTITY")
    blocked=auth(data,rid,digest,"migrate",gates={"writersControlled":True,"backupVerified":False,"restoreRehearsed":True})
    try:
        with mock_env(env),ops.Database(release,admin,blocked,"migrate") as db:db.ask("prepare-migration")
        case("migration-unverified-backup-refused-before-CLI",False)
    except c.Refused as failure:case("migration-unverified-backup-refused-before-CLI",str(failure)=="MIGRATION_AUTHORIZATION")
    prod=auth(data,rid,digest,"migrate",environment="production")
    try:
        with mock_env(env),ops.Database(release,admin,prod,"migrate"):pass
        case("candidate-production-migration-refused-before-connection",False)
    except c.Refused as failure:case("candidate-production-migration-refused-before-connection",str(failure)=="CANDIDATE_NOT_DEPLOYABLE")
    case("negative-guards-preserve-journal-and-current",layout.load()==original_state)
    cli("smoke",rid,digest,auth(data,rid,digest,"smoke"),env)
    save()

def filesystem_process_cases():
    spec=importlib.util.spec_from_file_location("release_test_fixtures",ROOT/"deploy/tests/test_releases.py")
    fixtures=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixtures)
    fixture=fixtures.ReleaseTests("test_R1_stage_preserves_current_and_verifies_pair");fixture.setUp()
    proc=None
    try:
        entries=[fixture.stage(i) for i in range(21,26)]
        state=fixture.layout.load()
        state["history"]={rid:{"lastActivated":ops.now()-20*86400+i} for i,(rid,_,_) in enumerate(entries)}
        fixture.layout.save(state)
        proc=subprocess.Popen(["/bin/sleep","120"],cwd=fixture.layout.releases/entries[0][0])
        ops.prune(fixture.layout,SimpleNamespace(days=7,keep=3,apply=True))
        case("R21-Linux-proc-preserves-in-use-release", (fixture.layout.releases/entries[0][0]).exists() and not (fixture.layout.releases/entries[1][0]).exists())
        ops.prune(fixture.layout,SimpleNamespace(days=7,keep=3,apply=True))
        case("R21-Linux-prune-idempotent")
    finally:
        if proc:proc.terminate();proc.wait()
        fixture.tearDown()

def prepare_reboot():
    data,env=context()
    run(["systemctl","enable",*ops.SERVICES])
    b=data["releaseB"];bd=data["digestB"]
    auth_path=auth(data,b,bd)
    cmd=["python3",str(ROOT/"deploy/scripts/release.py"),"activate","--release-id",b,"--digest",bd,"--authorization",str(auth_path)]
    child=subprocess.Popen(cmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
    paused=False
    for line in child.stdout:
        item=json.loads(line)
        if item.get("phase")=="stopping":
            os.kill(child.pid,signal.SIGSTOP);paused=True;break
    c.require(paused,"DEPLOY_PAUSE_NOT_REACHED")
    data.update(interruptedPid=child.pid,bootBefore=ops.boot_id())
    c.atomic_json(LAB/"context.json",data)
    case("R19-real-activation-paused-before-reboot",ops.Layout("/").load()["status"]=="in-progress")
    save()

def reboot_check():
    data,env=context()
    case("R19-real-boot-id-changed",ops.boot_id()!=data["bootBefore"])
    case("R19-guard-prevents-ambiguous-autostart",all(ops.service_state(s).get("MainPID")=="0" for s in ops.SERVICES))
    c.require(ops.Layout("/").load()["status"]=="in-progress","INTERRUPTION_JOURNAL")
    c.require(data["target"]["serverUuid"] in (LAB/"mysql-data/auto.cnf").read_text(),"MYSQL_UUID_AFTER_REBOOT")
    sock=socket.socket()
    c.require(sock.connect_ex(("127.0.0.1",data["target"]["port"]))!=0,"UNEXPECTED_DATABASE_LISTENER");sock.close()
    base=Path(data["mysql"]).parents[1]
    proc=subprocess.Popen([str(base/"bin/mysqld"),"--no-defaults","--user=root","--basedir="+str(base),"--datadir="+str(LAB/"mysql-data"),
      "--port="+str(data["target"]["port"]),"--bind-address=127.0.0.1","--skip-name-resolve","--mysqlx=OFF","--skip-log-bin",
      "--innodb-buffer-pool-size=134217728","--default-time-zone=+00:00","--socket="+str(LAB/"mysql.sock"),
      "--pid-file="+str(LAB/"mysql.pid"),"--log-error="+str(LAB/"mysql.log")],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        c.require(proc.poll() is None,"OWNED_MYSQL_RESTART")
        r=mysql(data,"SELECT @@server_uuid;",check=False)
        if r.returncode==0:break
        time.sleep(.2)
    c.require(r.stdout.strip()==data["target"]["serverUuid"] and int((LAB/"mysql.pid").read_text())==proc.pid,"MYSQL_RESTART_IDENTITY")
    data["serverPid"]=proc.pid;c.atomic_json(LAB/"context.json",data)
    run(["systemctl","start","nginx"])
    rid=data["releaseA"];digest=data["digestA"]
    cli("recover",rid,digest,auth(data,rid,digest,"recover"),env)
    case("R19-recovery-after-reboot-real-api-worker-and-smoke")
    cli("smoke",rid,digest,auth(data,rid,digest,"smoke"),env)
    case("worker-heartbeat-recovers-with-owned-database")
    filesystem_process_cases()
    case("private-evidence-survives-reboot",Path("/var/lib/traceflow/test-evidence/tf05-preserved.txt").read_text()=="synthetic-private-evidence")
    save()

def main():
    p=argparse.ArgumentParser();p.add_argument("action",choices=["setup","resume-setup","exercise","prepare-reboot","reboot-check","interruption-cases","final-candidate","negative-db-guards","cleanup"]);p.add_argument("--build");args=p.parse_args()
    guard()
    try:
        if args.action=="setup":setup(args.build)
        elif args.action=="resume-setup":resume_setup(args.build)
        elif args.action=="exercise":exercise(args.build)
        elif args.action=="prepare-reboot":prepare_reboot()
        elif args.action=="reboot-check":reboot_check()
        elif args.action=="interruption-cases":interruption_cases()
        elif args.action=="final-candidate":final_candidate(args.build)
        elif args.action=="negative-db-guards":negative_database_guards()
        elif args.action=="cleanup":
            data,env=context();run(["systemctl","stop",*ops.SERVICES,"nginx"])
            pid=data["serverPid"]
            c.require(Path("/proc",str(pid),"cmdline").read_bytes().find(str(LAB/"mysql-data").encode())>=0,"CLEANUP_OWNER")
            os.kill(pid,signal.SIGTERM)
            deadline=time.monotonic()+30
            while Path("/proc",str(pid)).exists() and time.monotonic()<deadline:time.sleep(.2)
            case("owned-mysql-stopped",not Path("/proc",str(pid)).exists())
            save()
        else:raise RuntimeError("exercise phase not yet installed")
    except Exception as e:
        RESULTS.append({"case":"harness","status":"FAIL","code":str(e)[:2500]})
        save();raise

if __name__=="__main__":main()
