#!/usr/bin/env python3
"""Pull-only clean CD receiver. No inbound port, cloud credentials, legacy protocol or DB writes."""
import base64,datetime as dt,fcntl,hashlib,importlib.util,json,os,re,shutil,signal,subprocess,sys,time,urllib.request
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from contract import need,sha,canonical,unpack,schema_gate,promote
REPO='iYoNuttxD/Traceflow';WORKFLOW='.github/workflows/oci-cd.yml'
CONFIG=Path('/etc/traceflow-live/cd.json');STATE=Path('/var/lib/traceflow-live-cd')
RELEASES=Path('/opt/traceflow-live/releases');FRONTENDS=Path('/var/www/traceflow-live-releases')
STATUS=Path('/var/www/traceflow-live-deploy-status')
CURRENT_KEYS={'currentRelease','frontendRoot','nginxSha256','proxySha256'}
def run(a,timeout=45):
 p=subprocess.run([str(x) for x in a],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,env={**os.environ,'HOME':'/nonexistent','LANG':'C.UTF-8','GH_PROMPT_DISABLED':'1'})
 need(p.returncode==0,'COMMAND_'+Path(str(a[0])).name.upper().replace('-','_'));return p.stdout

def atomic(p,v,mode=0o600):
 t=p.with_name('.write-'+str(os.getpid()));t.write_bytes(canonical(v));t.chmod(mode);os.replace(t,p)
def fetch(url,dest=None):
 need(url.startswith(('https://api.github.com/','https://github.com/'+REPO+'/releases/')),'HTTPS_SOURCE')
 req=urllib.request.Request(url,headers={'User-Agent':'TraceFlow-clean-CD','Accept':'application/vnd.github+json'})
 with urllib.request.urlopen(req,timeout=45) as response:
  need(response.url.startswith(('https://api.github.com/','https://github.com/','https://release-assets.githubusercontent.com/','https://objects.githubusercontent.com/')),'REDIRECT_SOURCE')
  if dest:
   total=0
   with dest.open('xb') as out:
    for b in iter(lambda:response.read(1024*1024),b''):
     total+=len(b);need(total<=300*1024**2,'DOWNLOAD_CAPACITY');out.write(b)
  else:return json.load(response)

def protected_fingerprints(paths):
 return {str(p):{'sha256':sha(p),'uid':p.stat().st_uid,'gid':p.stat().st_gid,'mode':p.stat().st_mode&0o7777} for p in map(Path,paths)}

def valid_window(request,cfg):
 now=dt.datetime.now(dt.timezone.utc).timestamp()
 issued=dt.datetime.fromisoformat(request['issuedAt']);expires=dt.datetime.fromisoformat(request['expiresAt'])
 need(issued.tzinfo is not None and expires.tzinfo is not None and 0<(expires-issued).total_seconds()<=1200,'DEPLOYMENT_DURATION')
 need(dt.datetime.fromisoformat(cfg['installedAt']).timestamp()<=dt.datetime.fromisoformat(request['issuedAt']).timestamp()<=now<dt.datetime.fromisoformat(request['expiresAt']).timestamp(),'DEPLOYMENT_WINDOW')
 value=fetch('https://api.github.com/repos/'+REPO+'/actions/runs/'+str(request['runId']))
 need(value['status']=='in_progress' and value['event']=='workflow_dispatch' and value['head_sha']==request['workflowSha'] and value['path']==WORKFLOW,'WORKFLOW_NOT_ACTIVE')

def current_manifest(path):
 schema=path/'backend/prisma/schema.prisma'
 return {'schemaSha256':sha(schema),'migrations':[{'name':p.parent.name,'sha256':sha(p)} for p in sorted((path/'backend/prisma/migrations').glob('*/migration.sql'))]}

class Host:
 def __init__(self,root,manifest,request,work,cfg):
  self.root=root;self.manifest=manifest;self.request=request;self.work=work;self.cfg=cfg
  self.units={n:Path('/etc/systemd/system')/('traceflow-live-'+n+'.service.d/30-cd-release.conf') for n in ('api','worker')}
  self.old={str(p):p.read_bytes() if p.exists() else None for p in self.units.values()}
  self.proxy=Path('/etc/nginx/traceflow-live/proxy.conf');self.nginx=Path('/etc/nginx/conf.d/traceflow.conf')
  self.old_proxy=self.proxy.read_bytes();self.old_nginx=self.nginx.read_bytes();self.frontend=FRONTENDS/root.name
  self.previous=Path(cfg['currentRelease']);self.previous_state={k:cfg[k] for k in CURRENT_KEYS}
  self.candidate=Path('/etc/systemd/system/traceflow-live-cd-candidate.service')
 def unit(self,role):
  return '[Service]\nWorkingDirectory='+str(self.root/'backend')+'\nExecStart=\nExecStart=/usr/bin/node '+str(self.root/'backend/src'/('server.js' if role=='api' else 'github-worker.js'))+'\n'
 def preflight(self):
  valid_window(self.request,self.cfg)
  need(run(['getenforce']).strip()==b'Enforcing','SELINUX')
  need(protected_fingerprints(self.cfg['protectedFiles'])==self.cfg['protectedFiles'],'OPERATIONAL_CONFIG_CHANGED')
  metrics=json.loads(Path('/var/lib/traceflow-live-ops/metrics.json').read_bytes());need(not metrics['failures'] and time.time()-dt.datetime.fromisoformat(metrics['at']).timestamp()<180,'CURRENT_HEALTH')
  backup=json.loads(Path('/var/lib/traceflow-live-ops/last-backup.json').read_bytes());need(backup['status']=='SUCCESS' and backup['externalReadback'] and time.time()-dt.datetime.fromisoformat(backup['finishedAt']).timestamp()<26*3600,'BACKUP_CURRENT')
  schema_gate(self.manifest,current_manifest(self.previous))
  # The current live backup contracts pin this migration chain; never override them here.
  need(len(self.manifest['migrations'])==68,'OPERATIONAL_SCHEMA_COMPATIBILITY')
  spec=importlib.util.spec_from_file_location('live_ops_readonly','/usr/local/libexec/traceflow-live-ops.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
  actual=ops.sql('SELECT CONCAT(migration_name,CHAR(9),checksum) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name')
  need(actual==[x['name']+'\t'+x['sha256'] for x in self.manifest['migrations']],'LIVE_MIGRATION_CHAIN')
  need(not self.candidate.exists() and not self.frontend.exists(),'NO_PARTIAL_INSTALL')
  need(sha(self.nginx)==self.cfg['nginxSha256'] and sha(self.proxy)==self.cfg['proxySha256'],'CONFIG_CHANGED_REVIEW_REQUIRED')
  for unit in ['traceflow-live-api','traceflow-live-worker','traceflow-live-backup.timer','traceflow-live-monitor.timer','traceflow-live-retention.timer']:run(['systemctl','is-active',unit])
  # Audit files and previous drop-ins are preserved root-only before coordinated promotion.
  for name,data in [('nginx.conf',self.old_nginx),('proxy.conf',self.old_proxy)]: (self.work/name).write_bytes(data)
  (self.work/'previous-dropins.json').write_bytes(canonical({k:v.decode() if v else None for k,v in self.old.items()}))
  shutil.copytree(self.root/'frontend',self.frontend,symlinks=False)
  old_assets=Path(self.cfg['frontendRoot'])/'assets'
  for source in old_assets.rglob('*'):
   if not source.is_file():continue
   need(not source.is_symlink(),'OLD_ASSET_LINK');target=self.frontend/'assets'/source.relative_to(old_assets)
   if target.exists():need(sha(target)==sha(source),'ASSET_NAME_COLLISION')
   else:
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
    for parent in (target.parent,*target.parent.parents):
     if parent==self.frontend:break
     parent.chmod(0o755)
    shutil.copy2(source,target);target.chmod(0o644)
  run(['restorecon','-R',self.root,self.frontend])
 def start_candidate(self):
  base=Path('/etc/systemd/system/traceflow-live-api.service').read_text()
  lines=[]
  for line in base.splitlines():
   if line.startswith('WorkingDirectory='):line='WorkingDirectory='+str(self.root/'backend')
   elif line.startswith('ExecStart='):line='ExecStart=/usr/bin/env PORT=3002 /usr/bin/node '+str(self.root/'backend/src/server.js')
   elif line.startswith('Restart='):line='Restart=no'
   lines.append(line)
  self.candidate.write_text('\n'.join(lines)+'\n');run(['restorecon',self.candidate]);run(['systemctl','daemon-reload']);run(['systemctl','start','traceflow-live-cd-candidate'])
 def ready(self,port,timeout=40):
  until=time.monotonic()+timeout
  while time.monotonic()<until:
   try:
    p=run(['curl','--fail','--silent','--show-error','--max-time','3',f'http://127.0.0.1:{port}/health/ready'],timeout=5)
    need(json.loads(p).get('status')=='ready','READINESS');return
   except (ValueError,subprocess.TimeoutExpired):time.sleep(1)
  raise ValueError('READINESS_TIMEOUT')
 def candidate_ready(self):self.ready(3002)
 def route_candidate(self):
  valid_window(self.request,self.cfg)
  need(self.old_proxy.count(b'proxy_pass http://127.0.0.1:3001;')==1,'PROXY_CONTRACT')
  self.proxy.write_bytes(self.old_proxy.replace(b'proxy_pass http://127.0.0.1:3001;',b'proxy_pass http://127.0.0.1:3002;',1))
  self.nginx.write_bytes(self.old_nginx.replace(('root '+self.cfg['frontendRoot']+';').encode(),('root '+str(self.frontend)+';').encode()))
  run(['nginx','-t']);run(['systemctl','reload','nginx'])
 def promote_services(self):
  for role,p in self.units.items():p.parent.mkdir(mode=0o755,exist_ok=True);p.write_text(self.unit(role));run(['restorecon',p])
  run(['systemctl','daemon-reload']);run(['systemctl','restart','traceflow-live-api'],timeout=90);run(['systemctl','restart','traceflow-live-worker'],timeout=120)
 def official_ready(self):
  self.ready(3001)
  for unit in ('traceflow-live-api','traceflow-live-worker'):run(['systemctl','is-active',unit])
  # Use the existing read-only monitor/credential, never an administrative DB client.
  run(['systemctl','start','traceflow-live-monitor.service'],timeout=100)
  v=json.loads(Path('/var/lib/traceflow-live-ops/metrics.json').read_bytes());need(v['mysql'] and v['workerCount']>=1 and v['workerHeartbeatAgeSeconds']<=90,'WORKER_OR_MYSQL')
 def route_official(self):self.proxy.write_bytes(self.old_proxy);run(['nginx','-t']);run(['systemctl','reload','nginx'])
 def smoke(self):
  valid_window(self.request,self.cfg)
  need(protected_fingerprints(self.cfg['protectedFiles'])==self.cfg['protectedFiles'],'OPERATIONAL_PRESERVATION')
  content=run(['curl','--fail','--silent','--show-error','--max-time','15','https://traceflow.dev/'],timeout=20)
  need(b'<html' in content and sha(self.frontend/'index.html')==hashlib.sha256(content).hexdigest(),'PUBLIC_FRONTEND')
  run(['systemctl','is-active','traceflow-live-backup.timer','traceflow-live-monitor.timer','traceflow-live-retention.timer'])
 def commit(self):
  value={'currentRelease':str(self.root),'frontendRoot':str(self.frontend),'nginxSha256':sha(self.nginx),'proxySha256':sha(self.proxy)}
  atomic(STATE/'current.json',value);self.cfg.update(value)
 def restore_previous(self):
  atomic(STATE/'current.json',self.previous_state);self.cfg.update(self.previous_state)
  self.proxy.write_bytes(self.old_proxy);self.nginx.write_bytes(self.old_nginx)
  for path,data in self.old.items():
   p=Path(path)
   if data is None:p.unlink(missing_ok=True)
   else:p.write_bytes(data)
  run(['systemctl','daemon-reload']);run(['systemctl','restart','traceflow-live-api'],timeout=90);run(['systemctl','restart','traceflow-live-worker'],timeout=120);run(['nginx','-t']);run(['systemctl','reload','nginx'])
 def previous_ready(self):self.ready(3001);run(['systemctl','is-active','traceflow-live-worker'])
 def stop_candidate(self):
  if not self.candidate.exists():return
  run(['systemctl','stop','traceflow-live-cd-candidate'],timeout=90)
  # Only this newly-created transient candidate unit is removed; immutable releases/evidence stay.
  if self.candidate.exists():self.candidate.unlink();run(['systemctl','daemon-reload'])

def process(release,cfg):
 tag=release['tag_name'];need(re.fullmatch('oci-cd-[0-9]+-[0-9]+',tag),'RELEASE_TAG')
 marker=STATE/(tag+'.json')
 if marker.exists():return
 assets={x['name']:x for x in release['assets']};need(set(assets)=={'release.tar.gz','request.json','request.sigstore.json'},'ASSETS')
 work=STATE/tag;work.mkdir(mode=0o700)
 for name in ('request.json','request.sigstore.json'):fetch(assets[name]['browser_download_url'],work/name)
 req=json.loads((work/'request.json').read_bytes());need(req['formatVersion']==1 and req['operation']=='promote-clean' and req['repository']==REPO and re.fullmatch('[a-f0-9]{40}',req['appSha']),'REQUEST')
 need(tag==f"oci-cd-{req['runId']}-{req['runAttempt']}" and dt.datetime.now(dt.timezone.utc).timestamp()<dt.datetime.fromisoformat(req['expiresAt']).timestamp(),'REQUEST_EXPIRED_OR_IDENTITY')
 need(re.fullmatch('[a-f0-9]{40}',req.get('workflowSha','')),'WORKFLOW_SHA')
 if req['workflowSha'] not in cfg['trustedWorkflowShas']:
  # Main may advance functionally. Trust only the unchanged complete CD authority
  # set, and bind its immutable commit through the certificate below.
  for name,digest in cfg['authorityFiles'].items():
   value=fetch('https://api.github.com/repos/'+REPO+'/contents/'+name+'?ref='+req['workflowSha'])
   need(value['type']=='file' and hashlib.sha256(base64.b64decode(value['content'])).hexdigest()==digest,'CD_AUTHORITY_CHANGED_REVIEW_REQUIRED')
 run([cfg['gh'],'attestation','verify',work/'request.json','--bundle',work/'request.sigstore.json','--repo',REPO,'--signer-workflow',REPO+'/'+WORKFLOW,'--source-ref','refs/heads/main','--source-digest',req['workflowSha'],'--deny-self-hosted-runners','--cert-oidc-issuer','https://token.actions.githubusercontent.com'],timeout=90)
 # Consumed exactly once, before any installation. Refusals/failures are terminal, never retried.
 atomic(marker,{'status':'STARTED','tag':tag,'appSha':req['appSha'],'at':dt.datetime.now(dt.timezone.utc).isoformat()})
 result={'runId':req['runId'],'appSha':req['appSha'],'packageSha256':req['packageSha256'],'status':'FAILED','rollback':'not-needed','workflowSha':req['workflowSha'],'manifestSha256':req['manifestSha256']}
 try:
  fetch(assets['release.tar.gz']['browser_download_url'],work/'release.tar.gz')
  root=RELEASES/(req['appSha']+'-'+req['packageSha256'][:12]);manifest=unpack(work/'release.tar.gz',root,req['packageSha256'])
  need(manifest['commit']==req['appSha'] and sha(root/'cd-manifest.json')==req['manifestSha256'] and manifest['arch']=='aarch64','PACKAGE_IDENTITY')
  host=Host(root,manifest,req,work,cfg);promote(host)
  result.update(status='SUCCESS',release=str(root),rollback='not-required',operationalConfigurationPreserved=True)
 except BaseException as error:
  result.update(code=str(error) if re.fullmatch('[A-Z][A-Z0-9_]{0,90}',str(error)) else 'DEPLOY_FAILED',rollback='inspect-preserved-transaction')
 finally:
  result['finishedAt']=dt.datetime.now(dt.timezone.utc).isoformat();atomic(marker,result);atomic(STATUS/(str(req['runId'])+'.json'),result,0o644)
 print(json.dumps(result));need(result['status']=='SUCCESS','PROMOTION_FAILED_NO_RETRY')

def main():
 need(os.geteuid()==0,'ROOT_REQUIRED');os.umask(0o077)
 cfg=json.loads(CONFIG.read_bytes());need(CONFIG.stat().st_uid==0 and CONFIG.stat().st_mode&0o077==0,'CONFIG_CUSTODY')
 if (STATE/'current.json').exists():
  current=json.loads((STATE/'current.json').read_bytes());need(set(current)==CURRENT_KEYS,'CURRENT_STATE_FIELDS');cfg.update(current)
 with (STATE/'deploy.lock').open('a+') as lock,Path('/var/lib/traceflow-live-ops/backup.lock').open('a+') as backup_lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  fcntl.flock(backup_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  releases=fetch('https://api.github.com/repos/'+REPO+'/releases?per_page=10')
  for release in reversed(releases):
   if release['draft'] or not re.fullmatch('oci-cd-[0-9]+-[0-9]+',release['tag_name']):continue
   if release['author']['login']!='github-actions[bot]':continue
   age=time.time()-dt.datetime.fromisoformat(release['published_at'].replace('Z','+00:00')).timestamp()
   if age<1800:process(release,cfg)
if __name__=='__main__':
 def interrupted(*_):raise InterruptedError('DEPLOY_INTERRUPTED')
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
 try:main()
 except BaseException as e:
  print(json.dumps({'status':'BLOCKED','code':str(e) if re.fullmatch('[A-Z][A-Z0-9_]{0,90}',str(e)) else 'RECEIVER_FAILED','automaticRetry':False}));sys.exit(1)
