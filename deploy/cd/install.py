#!/usr/bin/env python3
"""One-time root installation of pull-only CD. Does not publish application code."""
import argparse,hashlib,json,os,re,shutil,subprocess,tarfile,datetime
from pathlib import Path
BASELINE=Path('/opt/traceflow/releases/20261019T011508Z-9bc3dad199566afc6fa43d67abba400665d843ea-a6eda960ef55')
GH_ARCHIVE_SHA='7f322df34e624d14f5ec0c4acb121fd6dfa14392fdbbd1066aa8e0a05ac3721e'
def need(ok,code):
 if not ok:raise ValueError(code)
def run(a):
 p=subprocess.run([str(x) for x in a],capture_output=True,timeout=60);need(p.returncode==0,'COMMAND_'+Path(str(a[0])).name);return p.stdout

def install(source,gh_archive,workflow):
 need(os.geteuid()==0 and re.fullmatch('[a-f0-9]{40}',workflow),'ROOT_AND_WORKFLOW_SHA_REQUIRED');os.umask(0o077)
 need(BASELINE.is_dir() and Path('/etc/traceflow-live').is_dir(),'CLEAN_BASELINE_REQUIRED')
 for unit in ['traceflow-live-api','traceflow-live-worker','traceflow-live-backup.timer','traceflow-live-monitor.timer','traceflow-live-retention.timer']:run(['systemctl','is-active',unit])
 cfgpath=Path('/etc/traceflow-live/cd.json');need(not cfgpath.exists(),'EXCLUSIVE_INSTALLATION_NO_RETRY')
 need(hashlib.sha256(gh_archive.read_bytes()).hexdigest()==GH_ARCHIVE_SHA,'GH_TOOL_DIGEST')
 # All fixed prerequisites are checked before installing any file or SELinux rule.
 need(run(['uname','-m']).strip()==b'aarch64' and run(['getenforce']).strip()==b'Enforcing','NATIVE_ENFORCING_REQUIRED')
 need(not run(['ss','-H','-ltn','sport = :3002']).strip(),'CANDIDATE_PORT_BUSY')
 local=run(['semanage','port','-l','-C']).decode()
 need(not any('3002' in line for line in local.splitlines()),'CANDIDATE_PORT_ALREADY_CUSTOMIZED')
 for name in ('/var/lib/traceflow-live-cd','/usr/local/libexec/traceflow-live-cd','/opt/traceflow-tools/gh-2.103.0','/etc/systemd/system/traceflow-live-cd.service','/etc/systemd/system/traceflow-live-cd.timer'):
  need(not Path(name).exists(),'EXCLUSIVE_INSTALLATION_NO_RETRY')
 authority=['.github/workflows/oci-cd.yml']+['deploy/cd/'+name for name in ['package.py','build.sh','ci_gate.py','staging.sh','Dockerfile']]
 for name in authority:need((source.parents[1]/name).is_file(),'AUTHORITY_SOURCE_MISSING')
 nginx=Path('/etc/nginx/conf.d/traceflow.conf');proxy=Path('/etc/nginx/traceflow-live/proxy.conf');original=nginx.read_text()
 need(original.count('root /var/www/traceflow-live;')==1 and '/deploy-status/' not in original,'NGINX_BASELINE')
 need(proxy.read_bytes().count(b'proxy_pass http://127.0.0.1:3001;')==1,'PROXY_BASELINE')
 run(['nginx','-t'])
 state=Path('/var/lib/traceflow-live-cd');state.mkdir(mode=0o700)
 archive=state/'installation-baseline';archive.mkdir(mode=0o700)
 for p in [nginx,proxy]:shutil.copyfile(p,archive/p.name)
 for role in ('api','worker'):
  p=Path('/etc/systemd/system/traceflow-live-'+role+'.service');shutil.copyfile(p,archive/p.name)
 dest=Path('/usr/local/libexec/traceflow-live-cd');dest.mkdir(mode=0o755);dest.chmod(0o755)
 for name in ('receiver.py','contract.py'):
  p=dest/name;p.write_bytes((source/name).read_bytes());p.chmod(0o755)
 tool=Path('/opt/traceflow-tools/gh-2.103.0');tool.mkdir(mode=0o755);tool.chmod(0o755)
 with tarfile.open(gh_archive,'r:gz') as tar:
  item=tar.getmember('gh_2.103.0_linux_arm64/bin/gh');need(item.isfile(),'GH_TOOL_MEMBER')
  with tar.extractfile(item) as f,(tool/'gh').open('xb') as out:shutil.copyfileobj(f,out)
 (tool/'gh').chmod(0o755)
 for p in ('/opt/traceflow-live','/opt/traceflow-live/releases','/var/www/traceflow-live-releases','/var/www/traceflow-live-deploy-status'):
  Path(p).mkdir(parents=True,mode=0o755,exist_ok=True);Path(p).chmod(0o755)
 # Reserve only the second loopback API port under the already-approved custom type.
 run(['semanage','port','-a','-t','traceflow_api_port_t','-p','tcp','3002'])
 candidate_location='''    # Non-sensitive CD receipts only; no environment, cookies or credentials.
    location ^~ /deploy-status/ {
        alias /var/www/traceflow-live-deploy-status/;
        autoindex off;
        default_type application/json;
        add_header Cache-Control "no-store" always;
        limit_except GET HEAD { deny all; }
    }
'''
 nginx.write_text(original.replace('    root /var/www/traceflow-live;',candidate_location+'    root /var/www/traceflow-live;',1))
 try:run(['nginx','-t'])
 except BaseException:nginx.write_text(original);raise
 authority=['.github/workflows/oci-cd.yml']+['deploy/cd/'+name for name in ['package.py','build.sh','ci_gate.py','staging.sh','Dockerfile']]
 protected=list(Path('/etc/traceflow-live').glob('*.env'))+[Path('/etc/traceflow-live/operations.json'),Path('/usr/local/libexec/traceflow-live-ops.py'),Path('/usr/local/libexec/traceflow-live-retention.mjs')]+[p for p in Path('/etc/systemd/system').glob('traceflow-live-*') if p.is_file()]
 fingerprints={str(p):{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'uid':p.stat().st_uid,'gid':p.stat().st_gid,'mode':p.stat().st_mode&0o7777} for p in protected}
 cfg={'installedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protectedFiles':fingerprints,'authorityFiles':{name:hashlib.sha256((source.parents[1]/name).read_bytes()).hexdigest() for name in authority},'formatVersion':1,'currentRelease':str(BASELINE),'frontendRoot':'/var/www/traceflow-live','nginxSha256':hashlib.sha256(nginx.read_bytes()).hexdigest(),'proxySha256':hashlib.sha256(proxy.read_bytes()).hexdigest(),'trustedWorkflowShas':[workflow],'gh':str(tool/'gh')}
 cfgpath.write_text(json.dumps(cfg,sort_keys=True)+'\n');cfgpath.chmod(0o600)
 unit='''[Unit]
Description=TraceFlow pull-only human-approved signed CD
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=root
UMask=0077
Environment=GH_CONFIG_DIR=/var/lib/traceflow-live-cd/gh-config
Environment=XDG_CACHE_HOME=/var/lib/traceflow-live-cd/cache
ExecStart=/usr/bin/python3 -I -B /usr/local/libexec/traceflow-live-cd/receiver.py
LoadCredentialEncrypted=mysql-backup:/etc/credstore.encrypted/traceflow-live-mysql-backup
TimeoutStartSec=900
TimeoutStopSec=240
KillMode=control-group
Restart=no
LimitCORE=0
MemorySwapMax=0
MemoryMax=1G
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/traceflow-live-ops/backup.lock /var/lib/traceflow-live-cd /var/www/traceflow-live-releases /var/www/traceflow-live-deploy-status /opt/traceflow-live/releases /etc/systemd/system /etc/nginx/conf.d/traceflow.conf /etc/nginx/traceflow-live/proxy.conf
InaccessiblePaths=/etc/traceflow /opt/traceflow/shared /var/lib/traceflow-recovery /var/lib/traceflow/test-evidence
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
RestrictRealtime=yes
LockPersonality=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
StandardError=null
'''
 timer='''[Unit]
Description=TraceFlow outbound-only approved release check
[Timer]
OnBootSec=3min
OnUnitInactiveSec=5min
AccuracySec=15s
Unit=traceflow-live-cd.service
[Install]
WantedBy=timers.target
'''
 for name,data in [('traceflow-live-cd.service',unit),('traceflow-live-cd.timer',timer)]:
  p=Path('/etc/systemd/system')/name;need(not p.exists(),'UNIT_ALREADY_EXISTS');p.write_text(data);p.chmod(0o644);run(['restorecon',p])
 run(['restorecon','-R',dest,tool,'/opt/traceflow-live','/var/www/traceflow-live-releases','/var/www/traceflow-live-deploy-status'])
 run(['systemctl','daemon-reload']);run(['systemctl','reload','nginx']);run(['systemctl','enable','--now','traceflow-live-cd.timer'])
 print(json.dumps({'status':'CD_INSTALLED_NO_APPLICATION_PROMOTION','workflowSha':workflow,'portsOpenedToInternet':False,'staticProductionSecretsInGitHub':False,'candidatePort':'127.0.0.1:3002','backupAndMonitorUnitsChanged':False,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--gh-archive',type=Path,required=True);p.add_argument('--trusted-workflow-sha',required=True);a=p.parse_args();install(a.source,a.gh_archive,a.trusted_workflow_sha)
