"""First-publication contract. Root custody is an operator trust boundary, not a signature."""
import datetime as dt
import os
from pathlib import Path
import re
import time
from release_contract import require, digest, read_json, encoded, private_json
from operational_io import secure_read, unique

SHA = r"[a-f0-9]{64}"
ID = r"[a-f0-9]{32}"
PRE = {'recovery', 'smtp', 'runtime'}
POST = {'github', 'upload', 'functional'}
CONFIGS = ('runtime.env', 'api.env', 'github-worker.env')
NGINX = ('/etc/nginx/nginx.conf', '/etc/nginx/conf.d/traceflow.conf',
         '/etc/nginx/traceflow/cloudflare.conf', '/etc/nginx/traceflow/proxy.conf',
         '/etc/nginx/traceflow/static-headers.conf')
TARGET = {'host':'traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com',
          'expectedAddress':'10.20.2.25', 'port':3306, 'schema':'traceflow',
          'serverUuid':'6e94bb7f-c601-11f1-9b91-02001704771f',
          'version':'26.7.0-cloud', 'runtimeUser':'traceflow_api',
          'runtimeAccount':'traceflow_api@10.20.1.184', 'migrationUser':'traceflow_migrator'}

def exact(value, keys, code):
    require(isinstance(value, dict) and set(value)==set(keys), code)

def sha(value):
    require(isinstance(value,str) and re.fullmatch(SHA,value), 'EVIDENCE_DIGEST')
    return value

def utc(value):
    require(isinstance(value,str) and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z',value), 'UTC_REQUIRED')
    return dt.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()

def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')

def ref(value):
    exact(value, {'path','sha256'}, 'EVIDENCE_REFERENCE')
    p=Path(value['path']);require(p.is_absolute(), 'ABSOLUTE_EVIDENCE_PATH')
    raw=secure_read(p,os.geteuid(),2*1024*1024,0o600)
    require(digest(raw)==sha(value['sha256']), 'EVIDENCE_CHANGED')
    return unique(raw)

def authorize(a, manifest, wall=None):
    """Only this explicit operation defers public tests. Legacy gates are unchanged."""
    wall=time.time() if wall is None else wall
    exact(a, {'formatVersion','operation','environment','authorizationId','operatorId','runId','nonce',
              'releaseId','descriptorSha256','issuedAt','expiresAt','target','expectedSchemaFingerprint',
              'gates','preEvidence','configurationSha256','nginx','frontend','firstActivation'}, 'FIRST_AUTH_FIELDS')
    require(a['formatVersion']==1 and a['operation']=='activate-first' and a['environment']=='production', 'FIRST_AUTH_KIND')
    for k in ('authorizationId','runId','nonce'):
        require(isinstance(a[k],str) and re.fullmatch(ID,a[k]), 'FIRST_AUTH_ID')
    require(isinstance(a['operatorId'],str) and re.fullmatch(r'[A-Za-z0-9._@-]{3,80}',a['operatorId']), 'OPERATOR_ID')
    issued,expires=utc(a['issuedAt']),utc(a['expiresAt'])
    require(issued<=wall<expires and 0<expires-issued<=600, 'ACTIVATION_WINDOW_EXPIRED')
    require(a['firstActivation']=={'recovery':'temporary-page-stop-and-relock','operationalWindowAccepted':True,
        'runtimeAccountsAuthorized':['traceflow_api@10.20.1.184','traceflow_worker@10.20.1.184'],
        'publicCutoverAuthorized':True,'publicFunctionalWritesAuthorized':True}, 'RECOVERY_POLICY')
    require(a['target']==TARGET, 'FIRST_TARGET')
    require(a['releaseId']==manifest['releaseId'] and manifest['sourceState']=='committed','CANDIDATE_NOT_DEPLOYABLE')
    require(len(manifest['schema']['migrations'])==68, 'MIGRATION_CHAIN_COUNT')
    sha(a['descriptorSha256']);sha(a['expectedSchemaFingerprint'])
    require(a['gates']=={'writersControlled':True,'deploymentAuthorized':True,'heatwaveTlsHomologated':True,
                         'restoreRehearsed':True,'smtpHomologated':True}, 'FIRST_PRE_GATES')
    require(a['frontend']=={'url':'https://traceflow.dev'}, 'PUBLIC_ORIGIN')
    exact(a['configurationSha256'],CONFIGS,'CONFIGURATION_INVENTORY')
    for v in a['configurationSha256'].values():sha(v)
    exact(a['preEvidence'],PRE,'PRE_EVIDENCE_REQUIRED')
    n=a['nginx'];exact(n,{'before','after','temporaryPageSha256','candidateDirectory'},'NGINX_CONTRACT')
    exact(n['before'],NGINX,'NGINX_INVENTORY');exact(n['after'],NGINX,'NGINX_INVENTORY')
    for path,v in n['before'].items():
        if v is not None:sha(v)
        else:require(path not in NGINX[:2],'NGINX_BASELINE_REQUIRED')
    for v in n['after'].values():sha(v)
    sha(n['temporaryPageSha256'])
    require(n['candidateDirectory']=='/etc/traceflow/activation-candidates/'+a['runId'], 'NGINX_CANDIDATE_PATH')
    return expires

def pre_evidence(a, manifest, wall=None):
    wall=time.time() if wall is None else wall
    docs={kind:ref(value) for kind,value in a['preEvidence'].items()}
    for kind,d in docs.items():
        exact(d,{'formatVersion','kind','status','observedAt','serverUuid','chainSha256','configurationSha256','sources','checks'},'PRE_RECEIPT_FIELDS')
        require(d['formatVersion']==1 and d['kind']==kind and d['status']=='VERIFIED', 'PRE_RECEIPT_STATUS')
        observed=utc(d['observedAt']);require(0<=wall-observed<=86400,'PRE_RECEIPT_STALE')
        require(d['serverUuid']==TARGET['serverUuid'] and d['chainSha256']==manifest['schema']['chainSha256'] and
                d['configurationSha256']==a['configurationSha256'], 'PRE_RECEIPT_BINDING')
        require(isinstance(d['sources'],list) and 0<len(d['sources'])<=12,'PRE_SOURCE_REQUIRED')
        sources=[ref(r) for r in d['sources']]
        if kind=='recovery':
            require(d['checks']=={'encrypted':True,'externalReadback':True,'restoreIntegrity':True,'custodyExternal':True},'RECOVERY_EVIDENCE')
            restored=[s for s in sources if s.get('status')=='ISOLATED_RESTORE_INTEGRITY_PASS']
            require(len(restored)==1,'RESTORE_RECEIPT_REQUIRED');r=restored[0]
            require(r.get('externalReadback') is True and r.get('externalManifestRecovered') is True and
                    r.get('migrationRecords')==68 and r.get('dataDigestsEqual') is True and r.get('structuresEqual') is True and
                    r.get('recoveryConfigDigestsEqual') is True and r.get('productionDestination') is False and r.get('cleanup') is True,
                    'RESTORE_NOT_DEMONSTRATED')
            require(any(s.get('backupId')==r.get('backupId') and s.get('status')=='BACKUP_CAPTURE_ENCRYPTED' and
                        s.get('payloadSha256')==r.get('payloadSha256') and s.get('manifestSha256')==r.get('manifestSha256')
                        for s in sources),'BACKUP_RESTORE_CHAIN')
        elif kind=='smtp':
            require(any(s.get('status')=='SMTP_HOMOLOGATED' and s.get('tlsAuthentication')=='PASS' and
                        s.get('submissionResponse')==250 and s.get('acceptedCount')==1 and s.get('rejectedCount')==0 and
                        s.get('recipientConfirmation')=='RECEIVED_IN_INBOX' for s in sources),'SMTP_SOURCE_REQUIRED')
            require(d['checks']=={'tls':True,'authentication':True,'accepted':True,'receivedByOperator':True},'SMTP_EVIDENCE')
        else:
            require(d['checks']=={'selinuxRestricted':True,'storage':True,'environment':True,'githubPrepared':True,
                                 'uploadTransportPrepared':True,'noOtherWriters':True},'RUNTIME_EVIDENCE')
    return {k:a['preEvidence'][k]['sha256'] for k in sorted(PRE)}

def post_evidence(d,a,kind,cutover,wall=None):
    wall=time.time() if wall is None else wall
    exact(d,{'formatVersion','kind','status','runId','nonce','releaseId','descriptorSha256','authorizationId',
             'observedAt','operatorId','sources','checks'},'POST_RECEIPT_FIELDS')
    require(d['formatVersion']==1 and d['kind']==kind and kind in POST and d['status']=='VERIFIED', 'POST_RECEIPT_STATUS')
    for k in ('runId','nonce','releaseId','descriptorSha256','authorizationId','operatorId'):
        require(d[k]==a[k],'POST_RECEIPT_BINDING')
    observed=utc(d['observedAt']);require(cutover<=observed<=wall<utc(a['expiresAt']), 'POST_RECEIPT_TIME')
    require(isinstance(d['sources'],list) and 0<len(d['sources'])<=12,'POST_SOURCE_REQUIRED')
    sources=[ref(source) for source in d['sources']]
    # Root-custodied observations record real operator checks; hashes alone prove no origin.
    observation={k:d[k] for k in ('kind','runId','nonce','releaseId','descriptorSha256','authorizationId','operatorId','observedAt','checks')}
    observation.update(formatVersion=1,type='traceflow-public-observation')
    require(any(source==observation for source in sources),'PUBLIC_OBSERVATION_REQUIRED')
    c=d['checks']
    if kind=='github':
        exact(c,{'deliveryId','payloadSha256','signatureAccepted','httpStatus','webhookUrl','oauthUrl','setupUrl'},'GITHUB_POST_FIELDS')
        require(isinstance(c['deliveryId'],str) and re.fullmatch(r'[a-f0-9-]{36}',c['deliveryId']), 'GITHUB_DELIVERY_REQUIRED')
        sha(c['payloadSha256'])
        require(c['signatureAccepted'] is True and c['httpStatus'] in (200,202,204) and
                c['webhookUrl']=='https://traceflow.dev/api/webhooks/github-app' and
                c['oauthUrl']=='https://traceflow.dev/api/auth/github/callback' and
                c['setupUrl']=='https://traceflow.dev/api/github-app/callback','GITHUB_PUBLIC_REQUIRED')
    elif kind=='upload':
        exact(c,{'uploadSha256','downloadSha256','bytes','largestRequestBytes','resumable','publicOrigin','authorizedDownload','unauthorizedDenied'},'UPLOAD_POST_FIELDS')
        require(sha(c['uploadSha256'])==sha(c['downloadSha256']) and type(c['bytes']) is int and c['bytes']==100*1024**2 and
                type(c['largestRequestBytes']) is int and 0<c['largestRequestBytes']<=8*1024**2 and
                c['resumable'] is True and c['publicOrigin']=='https://traceflow.dev' and
                c['authorizedDownload'] is True and c['unauthorizedDenied'] is True,'UPLOAD_PUBLIC_REQUIRED')
    else:
        require(c=={'publicOrigin':'https://traceflow.dev','login':True,'projectRead':True,'testExecution':True,
                    'logout':True,'noUnreviewedErrors':True},'FUNCTIONAL_PUBLIC_REQUIRED')
    return digest(encoded(d))

class Deadline:
    def __init__(self, expires, wall=time.time, monotonic=time.monotonic):
        self.wall,self.monotonic=wall,monotonic;self.expires=expires
        self.end=monotonic()+min(600,expires-wall())
        self.check()
    def check(self):
        require(self.wall()<self.expires and self.monotonic()<self.end,'ACTIVATION_WINDOW_EXPIRED')
        return min(self.expires-self.wall(),self.end-self.monotonic())
