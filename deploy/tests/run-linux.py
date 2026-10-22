#!/usr/bin/env python3
"""Destructive ONLY to a marked disposable Lima tf04 VM, never a production host.
Prerequisites and invocation: docs/runbooks/OCI_RUNTIME_SERVICES.md.
Runs real nginx 1.20.1/systemd/SELinux, synthetic TLS and Express; no database server.
"""
import argparse
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import ssl
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
RESULTS = []

def command(*args, input=None, check=True, env=None):
    r = subprocess.run(args, input=input, text=True, capture_output=True, env=env)
    if check and r.returncode:
        # Commands never take credentials; raw journal/env output is not included.
        raise RuntimeError("command failed: " + " ".join(args[:3]) + " " + r.stderr[:500])
    return r.stdout.strip()

def assert_case(name, condition):
    RESULTS.append({"case": name, "status": "PASS" if condition else "FAIL"})
    print(name, RESULTS[-1]["status"], flush=True)
    if not condition:
        raise AssertionError(name)

def wait_for(predicate, seconds=10):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if predicate(): return True
        except (OSError, ValueError, http.client.HTTPException): pass
        time.sleep(0.1)
    return False

def local(path="/health/live"):
    c = http.client.HTTPConnection("127.0.0.1", 3001, timeout=5)
    try:
        c.request("GET", path); r = c.getresponse(); return r.status, r.read()
    finally: c.close()

class HTTPS(http.client.HTTPSConnection):
    def __init__(self, context, trusted=True, sni="traceflow.dev", **kwargs):
        self.sni = sni
        super().__init__("127.0.0.1", 443, context=context, source_address=("127.0.0.2" if trusted else "127.0.0.1", 0), timeout=35, **kwargs)
    def connect(self):
        sock = socket.create_connection(("127.0.0.1", 443), self.timeout, self.source_address)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.sni)

def request(path, method="GET", body=None, headers=None, trusted=True, context=None, sni="traceflow.dev"):
    c = HTTPS(context or CTX, trusted=trusted, sni=sni)
    h = {"Host":"traceflow.dev", "CF-Connecting-IP":"198.51.100.47"}
    h.update(headers or {})
    try:
        c.request(method, path, body=body, headers=h); r=c.getresponse()
        return r.status, dict((k.lower(),v) for k,v in r.getheaders()), r.read()
    finally: c.close()

def main():
    global CTX
    marker=Path("/run/traceflow-oci04-disposable")
    if os.geteuid()!=0 or socket.gethostname()!="lima-tf04" or not marker.is_file() or marker.is_symlink():
        raise RuntimeError("REFUSED: only the explicitly marked disposable lima-tf04 VM is allowed")
    if marker.stat().st_uid!=0 or marker.stat().st_mode & 0o077 or not hmac.compare_digest(marker.read_text().strip(), os.environ.get("TF04_VM_TOKEN", "")):
        raise RuntimeError("REFUSED: disposable VM ownership token mismatch")
    if command("systemd-detect-virt") in ("none", ""):
        raise RuntimeError("REFUSED: virtualization proof required")
    assert_case("platform-oracle98-arm64-nginx1201-systemd252-enforcing", "9.8" in Path("/etc/oracle-release").read_text() and command("uname","-m")=="aarch64" and command("getenforce")=="Enforcing" and subprocess.run(["nginx","-v"],capture_output=True,text=True).stderr.strip()=="nginx version: nginx/1.20.1" and command("systemctl","--version").startswith("systemd 252"))
    command("id","traceflow",check=False)
    if subprocess.run(["id","traceflow"],capture_output=True).returncode:
        command("useradd","--system","--user-group","--shell","/sbin/nologin","--no-create-home","traceflow")
    command("python3",str(ROOT/"deploy/scripts/prepare-runtime-directories.py"),"--apply")
    command("python3",str(ROOT/"deploy/scripts/prepare-runtime-directories.py"),"--apply")
    current=Path("/opt/traceflow/current")
    if current.exists() and not (current/".tf04-fixture").is_file(): raise RuntimeError("unowned release path")
    current.mkdir(exist_ok=True); (current/".tf04-fixture").touch()
    for name in ("backend","deploy"):
        shutil.copytree(ROOT/name,current/name,dirs_exist_ok=True)
    # Ensure binaries/libraries have their vendor modes, and runtime cannot alter code.
    command("chown","-R","root:root",str(current))
    command("chmod","-R","go-w",str(current))
    command("chmod","755",str(current))
    web=Path("/var/www/traceflow/tf04-dist"); shutil.copytree(ROOT/"frontend/dist",web,dirs_exist_ok=True)
    link=Path("/var/www/traceflow/current")
    if not link.exists(): link.symlink_to(web, target_is_directory=True)
    if link.resolve()!=web: raise RuntimeError("unowned public current")
    (web/"assets/fixture-12345678.js").write_text("window.fixture=true;")
    (web/"assets/unhashed.js").write_text("window.unhashed=true;")
    (web/".env").write_text("DENIED_SYNTHETIC_FILE")
    if not (web/"forbidden.txt").is_symlink(): (web/"forbidden.txt").symlink_to("/var/lib/traceflow/test-evidence/synthetic.txt")
    evidence=Path("/var/lib/traceflow/test-evidence/synthetic.txt");evidence.write_text("synthetic-private-evidence")
    command("chown","traceflow:traceflow",str(evidence)); evidence.chmod(0o600)
    secrets_dir=Path("/etc/traceflow")
    values=json.loads(command("node","--input-type=module","-e", "import { productionEnvironment } from '"+str(current/"backend/test/helpers/production-environment.js")+"';process.stdout.write(JSON.stringify(productionEnvironment({FRONTEND_URL:'https://traceflow.dev',CORS_ALLOWED_ORIGINS:'https://traceflow.dev'})))"))
    # Only newly generated synthetic values. No inherited host config or .env.
    fixed={"NODE_ENV","HTTP_HOST","PORT","TRUST_PROXY","GITHUB_SCHEDULER_ENABLED","SHUTDOWN_TIMEOUT_MS"}
    (secrets_dir/"runtime.env").write_text("\n".join(k+"="+v for k,v in values.items() if k not in fixed)+"\n")
    (secrets_dir/"api.env").write_text("")
    (secrets_dir/"github-worker.env").write_text("")
    for f in secrets_dir.iterdir(): f.chmod(0o600)
    for name in ("traceflow-api", "traceflow-github-worker"):
        shutil.copy2(current/"deploy/systemd"/(name+".service"),Path("/etc/systemd/system")/(name+".service"))
        drop=Path("/etc/systemd/system")/(name+".service.d"); drop.mkdir(exist_ok=True)
        if (drop/"fixture.conf").exists(): (drop/"fixture.conf").unlink()
        (drop/"test-network.conf").write_text("[Service]\nIPAddressDeny=any\nIPAddressAllow=localhost\n")
    command("restorecon","-R","/etc/systemd/system",str(current),"/etc/traceflow","/var/lib/traceflow")
    command("bash",str(current/"deploy/scripts/validate-systemd.sh"),"/etc/systemd/system")
    assert_case("S1-S4-S10-units-verify-fixed-contracts",True)
    Path("/etc/nginx/ssl").mkdir(exist_ok=True,mode=0o700)
    command("restorecon","-R","/etc/nginx/ssl")
    command("systemctl","daemon-reload")
    command("systemctl","reset-failed","traceflow-api","traceflow-github-worker",check=False)
    command("systemctl","start","traceflow-api","traceflow-github-worker")
    assert_case("S5-real-api-loopback-live",wait_for(lambda:local()[0]==200))
    assert_case("real-api-database-unavailable-readiness503",local("/health/ready")[0]==503)
    listeners=command("ss","-ltnp")
    worker_pid=command("systemctl","show","traceflow-github-worker","-p","MainPID","--value")
    assert_case("S6-real-worker-no-listener",not any("pid="+worker_pid+"," in line for line in listeners.splitlines()))
    assert_case("S3-runtime-nonroot",command("ps","-o","user=","-p",command("systemctl","show","traceflow-api","-p","MainPID","--value"))=="traceflow")
    assert_case("S5-no-public-node-bind",any("127.0.0.1:3001" in line for line in listeners.splitlines()) and not any("0.0.0.0:3001" in line or "[::]:3001" in line for line in listeners.splitlines()))
    start=time.monotonic();command("systemctl","stop","traceflow-api","traceflow-github-worker")
    assert_case("S9-real-api-worker-sigterm",time.monotonic()-start<45 and command("systemctl","show","traceflow-api","-p","Result","--value")=="success")
    # Invalid production flag must fail preflight and hit StartLimitBurst, not spin.
    (secrets_dir/"api.env").write_text("GITHUB_SCHEDULER_ENABLED=true\n")
    command("systemctl","start","traceflow-api",check=False)
    assert_case("S8-invalid-config-bounded-restarts",wait_for(lambda: command("systemctl","show","traceflow-api","-p","ActiveState","--value")=="failed" and int(command("systemctl","show","traceflow-api","-p","NRestarts","--value"))==3,40))
    restart_count=int(command("systemctl","show","traceflow-api","-p","NRestarts","--value"))
    time.sleep(11)
    assert_case("S8-restart-budget",restart_count==3 and int(command("systemctl","show","traceflow-api","-p","NRestarts","--value"))==restart_count and command("systemctl","show","traceflow-api","-p","MainPID","--value")=="0")
    (secrets_dir/"api.env").write_text("")
    command("systemctl","reset-failed","traceflow-api")
    command("systemctl","start","traceflow-api")
    assert_case("S7-recovery-after-corrected-config",wait_for(lambda:local()[0]==200))
    pid_before=command("systemctl","show","traceflow-api","-p","MainPID","--value")
    command("systemctl","kill","--signal=SIGKILL","--kill-whom=main","traceflow-api")
    assert_case("S7-restart-after-crash",wait_for(lambda:command("systemctl","show","traceflow-api","-p","MainPID","--value") not in ("0",pid_before) and local()[0]==200,15))
    command("systemctl","stop","traceflow-api")
    command("systemctl","enable","traceflow-api","traceflow-github-worker")
    assert_case("S12-install-target-enablement",command("systemctl","is-enabled","traceflow-api")=="enabled" and command("systemctl","is-enabled","traceflow-github-worker")=="enabled")
    command("systemctl","disable","traceflow-api","traceflow-github-worker")
    # Same hardening/identity; only ExecStart changes to a controlled HTTP fixture.
    webhook_secret=secrets.token_hex(32)
    drop=Path("/etc/systemd/system/traceflow-api.service.d/fixture.conf")
    drop.write_text("[Service]\nExecStart=\nExecStart=/usr/bin/node /opt/traceflow/current/deploy/tests/controlled-upstream.mjs\nEnvironment=TF04_DISPOSABLE=local-oracle-linux-fixture\nEnvironment=TF04_SANDBOX_REPORT=1\nEnvironment=TF04_WEBHOOK_SECRET="+webhook_secret+"\n")
    drop.chmod(0o600)
    certs=Path("/etc/nginx/ssl");certs.mkdir(exist_ok=True,mode=0o700)
    command("openssl","req","-x509","-newkey","rsa:2048","-nodes","-keyout",str(certs/"traceflow-origin.key"),"-out",str(certs/"traceflow-origin.pem"),"-days","1","-subj","/CN=traceflow.dev","-addext","subjectAltName=DNS:traceflow.dev")
    (certs/"traceflow-origin.key").chmod(0o600)
    command("restorecon","-R",str(certs))
    command("systemctl","daemon-reload");command("systemctl","start","traceflow-api")
    assert_case("fixture-upstream-started",wait_for(lambda:local("/api/projects")[0]==200))
    report=json.loads(Path("/var/lib/traceflow/test-evidence/sandbox.json").read_text())
    assert_case("S11-effective-sandbox-code-config-tls-private",len(report["denied"])==3 and report["allowed"]==[] and report["uid"]!=0)
    snippets=Path("/etc/nginx/traceflow"); snippets.mkdir(exist_ok=True)
    for f in (current/"deploy/nginx/snippets").iterdir(): shutil.copy2(f,snippets/f.name)
    # Explicit fixture-only peer. Production file is tested separately without it.
    trusted_file=snippets/"cloudflare.conf"
    trusted_original=trusted_file.read_text()
    trusted_file.write_text(trusted_original.replace("    default 0;","    default 0;\n    127.0.0.2/32 1;")+"set_real_ip_from 127.0.0.2/32;\n")
    shutil.copy2(current/"deploy/nginx/traceflow.conf","/etc/nginx/conf.d/traceflow.conf")
    # Model the documented removal of the vendor catch-all. No other host exists.
    Path("/etc/nginx/nginx.conf").write_text("user nginx;\nworker_processes 1;\npid /run/nginx.pid;\nerror_log /var/log/nginx/error.log;\nevents { worker_connections 1024; }\nhttp { include /etc/nginx/mime.types; default_type application/octet-stream; include /etc/nginx/conf.d/traceflow.conf; }\n")
    command("bash",str(current/"deploy/scripts/configure-selinux.sh"),"--apply")
    command("bash",str(current/"deploy/scripts/configure-selinux.sh"),"--apply")
    command("restorecon","-R","/var/www/traceflow","/etc/nginx/traceflow","/etc/nginx/conf.d")
    command("bash",str(current/"deploy/scripts/validate-nginx.sh"),"/etc/nginx","/etc/nginx/nginx.conf")
    command("systemctl","start","nginx")
    CTX=ssl.create_default_context(cafile=str(certs/"traceflow-origin.pem"))
    assert_case("nginx-syntax-and-httpd-selinux-domain", "httpd_t" in command("ps","-eZ") and command("getenforce")=="Enforcing")
    c=http.client.HTTPConnection("127.0.0.1",80,timeout=5);c.request("GET","/projects/123?view=one",headers={"Host":"traceflow.dev"}); rr=c.getresponse()
    assert_case("N1-http-fixed-domain-redirect",rr.status==301 and rr.getheader("Location")=="https://traceflow.dev/projects/123?view=one");rr.read();c.close()
    for raw in (b"GET / HTTP/1.0\r\n\r\n",b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",b"GET / HTTP/1.1\r\nHost: injected.invalid\r\n\r\n"):
        with socket.create_connection(("127.0.0.1",80),5) as raw_socket:
            raw_socket.sendall(raw); reply=raw_socket.recv(4096)
            assert_case("N8-HTTP-invalid-or-missing-host-"+str(len(raw)),b"TRACEFLOW" not in reply and b"301" not in reply)
    no_sni=ssl.create_default_context(cafile=str(certs/"traceflow-origin.pem"));no_sni.check_hostname=False
    try:
        with socket.create_connection(("127.0.0.1",443),5) as raw_socket:
            with no_sni.wrap_socket(raw_socket,server_hostname=None): pass
        rejected=False
    except ssl.SSLError: rejected=True
    assert_case("N8-no-SNI-rejected",rejected)
    for version in (ssl.TLSVersion.TLSv1_2,ssl.TLSVersion.TLSv1_3):
        ctx=ssl.create_default_context(cafile=str(certs/"traceflow-origin.pem"));ctx.minimum_version=ctx.maximum_version=version
        assert_case("N2-TLS-"+version.name,request("/",context=ctx)[0]==200)
    try: request("/",context=ssl.create_default_context()); untrusted=False
    except ssl.SSLError: untrusted=True
    assert_case("N2-untrusted-certificate-rejected",untrusted)
    try: request("/",sni="unknown.invalid"); rejected=False
    except ssl.SSLError: rejected=True
    assert_case("N8-unknown-SNI-rejected",rejected)
    try: request("/",headers={"Host":"unknown.invalid"}); rejected=False
    except (http.client.HTTPException,OSError): rejected=True
    assert_case("N8-unknown-host-rejected",rejected)
    assert_case("N16-direct-origin-forged-CF-denied",request("/api/projects",trusted=False,headers={"CF-Connecting-IP":"203.0.113.9","X-Forwarded-For":"1.1.1.1"})[0]==403)
    status,headers,html=request("/")
    assert_case("I1-N5-real-vite-home",status==200 and b"TRACEFLOW" in html)
    for path in ("/projects/123","/projects/123/repository","/projects/123/requirements","/projects/123/indicators","/settings"):
        assert_case("N5-SPA-"+path,request(path)[2]==html)
    for path in ("/assets/missing.js","/missing.js","/.env","/backend/package.json","/package-lock.json","/test-evidence/synthetic.txt","/var/lib/traceflow/test-evidence/synthetic.txt","/forbidden.txt","/health","/health/live","/health/ready"):
        status,_,data=request(path);assert_case("N6-N7-N13-private-or-missing-"+path,status in (403,404) and b"synthetic-private-evidence" not in data and data!=html)
    assert_case("N14-index-revalidates",request("/index.html")[1].get("cache-control")=="no-cache")
    assert_case("N14-hashed-assets-immutable","immutable" in request("/assets/fixture-12345678.js")[1].get("cache-control",""))
    assert_case("N14-unhashed-assets-not-immutable","immutable" not in request("/assets/unhashed.js")[1].get("cache-control",""))
    assert_case("N15-static-headers-and-progressive-CSP",headers.get("x-content-type-options")=="nosniff" and "frame-ancestors 'none'" in headers.get("content-security-policy","") and "frame-src 'self' blob:" in headers.get("content-security-policy-report-only","") and "/1.20" not in headers.get("server",""))
    status,headers,data=request("/api/projects",headers={"X-Forwarded-For":"1.1.1.1, 2.2.2.2","X-Forwarded-Proto":"http","X-Forwarded-Host":"evil.invalid","Forwarded":"for=1.1.1.1;proto=http","X-Request-Id":"forged"})
    body=json.loads(data)
    assert_case("N3-N4-N16-canonical-proxy-headers",status==200 and body["path"]=="/api/projects" and body["ip"]=="198.51.100.47" and body["protocol"]=="https" and body["host"]=="traceflow.dev" and body["forwarded"] is None and body["cf"] is None and body["requestId"]!="forged")
    assert_case("N14-api-no-store",headers.get("cache-control")=="no-store, no-transform")
    for method in ("GET","POST","PUT","PATCH","DELETE"):
        status,_,data=request("/api/projects",method=method)
        assert_case("N17-method-"+method,status==200 and json.loads(data)["method"]==method)
    status,options_headers,_=request("/api/projects",method="OPTIONS",headers={"Origin":"https://traceflow.dev","Access-Control-Request-Method":"PATCH"})
    assert_case("N17-method-OPTIONS-preflight-preserved",status==204 and "PATCH" in options_headers.get("access-control-allow-methods",""))
    assert_case("N4-bare-api",json.loads(request("/api")[2])["path"]=="/api")
    assert_case("N18-upstream404-is-json",request("/api/missing")[0]==404 and json.loads(request("/api/missing")[2])["code"]=="NOT_FOUND")
    assert_case("N18-upstream500-preserved",request("/api/failure")[0]==500 and json.loads(request("/api/failure")[2])["code"]=="SYNTHETIC_FAILURE")
    status,headers,data=request("/api/auth/login",method="POST",body=b"{}",headers={"Content-Type":"application/json"})
    cookie=headers.get("set-cookie","").split(";",1)[0]; csrf=json.loads(data)["csrfToken"]
    assert_case("N11-I4-cookie-and-prefix-preserved",status==200 and json.loads(data)["path"]=="/api/auth/login" and all(x in headers["set-cookie"] for x in ("HttpOnly","Secure","SameSite=Lax","Path=/")))
    assert_case("I5-CSRF-rejected",request("/api/mutation",method="POST",headers={"Cookie":cookie})[0]==403)
    assert_case("I5-CSRF-accepted",request("/api/mutation",method="POST",headers={"Cookie":cookie,"X-CSRF-Token":csrf})[0]==200)
    assert_case("CORS-unknown-origin-rejected",request("/api/projects",headers={"Origin":"https://untrusted.invalid"})[0]==403)
    assert_case("CORS-same-origin-accepted",request("/api/projects",headers={"Origin":"https://traceflow.dev"})[0]==200)
    payload=b'{ "action": "synthetic", "content":"raw bytes \\u00e7" }\n'
    signature="sha256="+hmac.new(webhook_secret.encode(),payload,hashlib.sha256).hexdigest()
    wh={"Content-Type":"application/json","X-Hub-Signature-256":signature,"X-GitHub-Delivery":"synthetic-delivery","X-GitHub-Event":"ping"}
    status,_,data=request("/api/webhooks/github-app",method="POST",body=payload,headers=wh)
    assert_case("N10-I7-real-verifier-HMAC-preserved",status==202 and json.loads(data)["digest"]==hashlib.sha256(payload).hexdigest())
    assert_case("N10-duplicate-delivery",request("/api/webhooks/github-app",method="POST",body=payload,headers=wh)[0]==200)
    assert_case("N10-altered-body-rejected",request("/api/webhooks/github-app",method="POST",body=payload+b" ",headers=wh)[0]==403)
    assert_case("N10-invalid-signature-rejected",request("/api/webhooks/github-app",method="POST",body=payload,headers={**wh,"X-Hub-Signature-256":"sha256=invalid"})[0]==403)
    assert_case("N10-missing-signature-rejected",request("/api/webhooks/github-app",method="POST",body=payload,headers={"Content-Type":"application/json"})[0]==403)
    assert_case("N10-missing-delivery-rejected",request("/api/webhooks/github-app",method="POST",body=payload,headers={k:v for k,v in wh.items() if k!="X-GitHub-Delivery"})[0]==400)
    assert_case("I9-private-download-unauthenticated",request("/api/test-evidence/1/content")[0]==401)
    assert_case("I9-private-download-authorized",request("/api/test-evidence/1/content",headers={"Cookie":cookie})[2]==b"synthetic-private-evidence")
    multipart=b'--fixture\r\nContent-Disposition: form-data; name="payload"\r\n\r\n{}\r\n--fixture\r\nContent-Disposition: form-data; name="evidence"; filename="synthetic.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--fixture--\r\n'
    status,_,data=request("/api/test-cases/1/executions",method="POST",body=multipart,headers={"Cookie":cookie,"Content-Type":"multipart/form-data; boundary=fixture"})
    assert_case("I8-multipart-byte-integrity",status==200 and json.loads(data)["digest"]==hashlib.sha256(multipart).hexdigest())
    # Exercise the actual configured byte ceiling; synthetic transport, not business validation.
    large=b"x"*(106*1024*1024)
    status,_,data=request("/api/test-cases/1/executions",method="POST",body=large,headers={"Cookie":cookie,"Content-Type":"multipart/form-data; boundary=fixture"})
    assert_case("N12-106MiB-transport-accepted",status==200 and json.loads(data)["bytes"]==len(large))
    del large
    status,_,data=request("/api/test-cases/1/executions",method="POST",body=b"",headers={"Cookie":cookie,"Content-Length":str(108*1024*1024+1)})
    assert_case("N12-over108MiB-413",status==413 and json.loads(data)["code"]=="INGRESS_PAYLOAD_TOO_LARGE")
    # Stream over the production heartbeat interval, then verify client disconnect cleanup.
    c=HTTPS(CTX);c.request("GET","/api/projects/1/events",headers={"Host":"traceflow.dev","Cookie":cookie,"CF-Connecting-IP":"198.51.100.47"});stream=c.getresponse();t=time.monotonic()
    assert_case("N9-SSE-no-transform", "no-transform" in stream.getheader("Cache-Control", ""))
    assert_case("N9-first-SSE-frame-unbuffered",stream.readline().startswith(b"retry:") and time.monotonic()-t<2)
    stream.readline();t=time.monotonic();line=stream.readline()
    assert_case("N9-25s-heartbeat-delivered",line.startswith(b": heartbeat") and 20<time.monotonic()-t<30)
    stream.close();c.close()
    assert_case("N9-client-disconnect-resources-released",wait_for(lambda:json.loads(request("/api/fixture-metrics")[2])["streams"]==0))
    c=HTTPS(CTX);c.request("GET","/api/projects/1/events",headers={"Host":"traceflow.dev","Cookie":cookie,"CF-Connecting-IP":"198.51.100.47"});stream=c.getresponse();stream.readline();stream.readline()
    command("systemctl","stop","traceflow-api")
    assert_case("N9-I12-SSE-closed-on-SIGTERM",stream.read()==b"");c.close()
    assert_case("I10-upstream-down-controlled-json",request("/api/projects")[0]==503 and json.loads(request("/api/projects")[2])["code"]=="UPSTREAM_UNAVAILABLE")
    command("systemctl","start","traceflow-api")
    assert_case("I12-proxy-recovers-after-restart",wait_for(lambda:request("/api/projects")[0]==200))
    sentinel="tf04-sensitive-query-path-marker"
    for path in ("/api/auth/callback?code="+sentinel+"&state="+sentinel,"/api/"+sentinel,"/missing.js?token="+sentinel):request(path,headers={"Authorization":"Bearer "+sentinel,"Cookie":sentinel})
    request("/api/test-cases/1/executions?code="+sentinel,method="POST",body=b"",headers={"Content-Length":str(108*1024*1024+1)})
    command("systemctl","stop","traceflow-api")
    request("/api/projects?code="+sentinel)
    logs="\n".join(f.read_text(errors="replace") for f in Path("/var/log/nginx").glob("*.log"))
    assert_case("N-logs-query-path-cookie-error-no-leak",sentinel not in logs and webhook_secret not in logs and csrf not in logs)
    assert_case("SELinux-no-global-network-boolean",command("getsebool","httpd_can_network_connect").endswith("off") and command("getsebool","httpd_can_network_relay").endswith("off"))
    assert_case("SELinux-private-storage-not-httpd-readable",subprocess.run(["runuser","-u","nginx","--","cat",str(evidence)],capture_output=True).returncode!=0)
    # Production trust file restored in the lab: loopback imitation must now fail.
    trusted_file.write_text(trusted_original);command("nginx","-t");command("systemctl","reload","nginx")
    assert_case("production-ranges-have-no-local-bypass",wait_for(lambda:request("/")[0]==403))
    assert_case("firewall-internal-ports-not-open",command("systemctl","is-active","firewalld")=="active" and all(command("firewall-cmd","--query-port="+port,check=False)!="yes" for port in ("3001/tcp","3306/tcp","33060/tcp")))

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--report",required=True,type=Path);args=parser.parse_args()
    if args.report.exists(): raise SystemExit("report must be a new file")
    error=None
    try: main()
    except Exception as failure:
        error=type(failure).__name__+": "+str(failure);print(error,flush=True)
    finally:
        # Only act after proof of the disposable marker AND hostname, even on refusal.
        marker=Path("/run/traceflow-oci04-disposable")
        if socket.gethostname()=="lima-tf04" and marker.is_file() and not marker.is_symlink() and marker.read_text().strip()==os.environ.get("TF04_VM_TOKEN"):
            for unit in ("traceflow-api","traceflow-github-worker","nginx"): command("systemctl","stop",unit,check=False)
        args.report.write_text(json.dumps({"cases":RESULTS,"error":error,"noOCI":True,"noDatabase":True,"fixtureAuth":True,"fixtureWebhookPersistence":True,"actualRebootTested":False},indent=2)+"\n")
    raise SystemExit(1 if error else 0)
