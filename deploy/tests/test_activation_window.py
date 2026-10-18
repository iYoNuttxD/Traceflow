"""OCI07.10: no network/SQL; boundary mocks are not operational homologation."""
import contextlib,copy,datetime as dt,importlib.util,io,json,os,sys,tempfile,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'deploy/lib'))
import release_contract as c
import activation_contract as contract
import activation_window as window
import runtime_grants as grants
import recovery_policy as backup
from operational_io import secure_read,private_write,tool
spec=importlib.util.spec_from_file_location('activation_test_ops',ROOT/'deploy/scripts/release.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
RID='20261017T182352Z-'+'a'*40+'-'+'b'*12
NOW=1792275000.0

def stamp(t):return dt.datetime.fromtimestamp(t,dt.timezone.utc).isoformat().replace('+00:00','Z')
def auth():
    return {'formatVersion':1,'operation':'activate-first','environment':'production','authorizationId':'a'*32,
        'operatorId':'synthetic-operator','runId':'b'*32,'nonce':'c'*32,'releaseId':RID,'descriptorSha256':'d'*64,
        'issuedAt':stamp(NOW-1),'expiresAt':stamp(NOW+590),'target':dict(contract.TARGET),'expectedSchemaFingerprint':'e'*64,
        'gates':{'writersControlled':True,'deploymentAuthorized':True,'heatwaveTlsHomologated':True,'restoreRehearsed':True,'smtpHomologated':True},
        'preEvidence':{k:{'path':'/synthetic/'+k,'sha256':'f'*64} for k in contract.PRE},
        'configurationSha256':{k:'1'*64 for k in contract.CONFIGS},'frontend':{'url':'https://traceflow.dev'},
        'nginx':{'before':{k:'2'*64 for k in contract.NGINX},'after':{k:'3'*64 for k in contract.NGINX},
                 'temporaryPageSha256':'4'*64,'candidateDirectory':'/etc/traceflow/activation-candidates/'+'b'*32},
        'firstActivation':{'recovery':'temporary-page-stop-and-relock','operationalWindowAccepted':True,
        'runtimeAccountsAuthorized':['traceflow_api@10.20.1.184','traceflow_worker@10.20.1.184'],
        'publicCutoverAuthorized':True,'publicFunctionalWritesAuthorized':True}}
def manifest():return {'releaseId':RID,'sourceState':'committed','schema':{'migrations':[{}]*68,'chainSha256':'5'*64}}
def post(a,kind,when):
    checks={'github':{'deliveryId':'11111111-1111-1111-1111-111111111111','payloadSha256':'a'*64,'signatureAccepted':True,'httpStatus':200,
                      'webhookUrl':'https://traceflow.dev/api/webhooks/github-app','oauthUrl':'https://traceflow.dev/api/auth/github/callback','setupUrl':'https://traceflow.dev/api/github-app/callback'},
            'upload':{'uploadSha256':'a'*64,'downloadSha256':'a'*64,'bytes':100*1024**2,'largestRequestBytes':8*1024**2,'resumable':True,
                      'publicOrigin':'https://traceflow.dev','authorizedDownload':True,'unauthorizedDenied':True},
            'functional':{'publicOrigin':'https://traceflow.dev','login':True,'projectRead':True,'testExecution':True,'logout':True,'noUnreviewedErrors':True}}
    return {**{k:a[k] for k in ('runId','nonce','releaseId','descriptorSha256','authorizationId','operatorId')},
            'formatVersion':1,'kind':kind,'status':'VERIFIED','observedAt':stamp(when),
            'sources':[{'path':'/synthetic/'+kind,'sha256':'b'*64}],'checks':checks[kind]}

def observation(d):
    return {**{k:d[k] for k in ('kind','runId','nonce','releaseId','descriptorSha256','authorizationId','operatorId','observedAt','checks')},'formatVersion':1,'type':'traceflow-public-observation'}

class ContractTests(unittest.TestCase):
    def test_valid_contract_defers_public_evidence(self):
        a=auth();self.assertEqual(contract.authorize(a,manifest(),NOW),NOW+590)
        self.assertNotIn('githubAppHomologated',a['gates']);self.assertNotIn('uploadsResolved',a['gates'])
    def test_closed_auth_and_every_precondition(self):
        base=auth()
        cases=[('extra',lambda a:a.update(extra=True)),('missing',lambda a:a.pop('preEvidence')),
               ('candidate',lambda a:None),('expired',lambda a:a.update(expiresAt=stamp(NOW))),
               ('future',lambda a:a.update(issuedAt=stamp(NOW+1))),('long',lambda a:a.update(expiresAt=stamp(NOW+601))),
               ('offset',lambda a:a.update(issuedAt='2026-10-17T20:00:00-03:00')),
               ('target',lambda a:a['target'].update(runtimeUser='root')),('unknown-mode',lambda a:a.update(operation='activate')),
               ('public-gates',lambda a:a['gates'].update(uploadsResolved=True)),('false-backup',lambda a:a['gates'].update(restoreRehearsed=False)),
               ('no-recovery',lambda a:a['firstActivation'].update(recovery='none')),('root-path',lambda a:a['nginx'].update(candidateDirectory='/tmp/x')),
               ('nginx-unknown',lambda a:a['nginx']['after'].update({'/etc/passwd':'a'*64}))]
        for name,mutate in cases:
            with self.subTest(name=name):
                a=copy.deepcopy(base);mutate(a);m=manifest()
                if name=='candidate':m['sourceState']='candidate'
                with self.assertRaises(c.Refused):contract.authorize(a,m,NOW)
    def test_each_gate_missing_refused(self):
        for key in auth()['gates']:
            with self.subTest(key=key):
                a=auth();a['gates'].pop(key)
                with self.assertRaises(c.Refused):contract.authorize(a,manifest(),NOW)
    def test_legacy_gates_are_not_relaxed(self):
        a=auth()
        for op in ('activate','rollback','recover','smoke'):
            with self.subTest(op=op),self.assertRaisesRegex(c.Refused,'uploadsResolved'):
                c.operation_gates(a,op)
    def test_all_postchecks_require_fresh_bound_proof(self):
        a=auth()
        for kind in contract.POST:
            good=post(a,kind,NOW+2)
            with mock.patch.object(contract,'ref',return_value=observation(good)):contract.post_evidence(good,a,kind,NOW+1,NOW+3)
            for field,value in [('runId','9'*32),('nonce','9'*32),('descriptorSha256','9'*64),('authorizationId','9'*32),
                                ('operatorId','other'),('observedAt',stamp(NOW)),('observedAt',stamp(NOW+4)),('sources',[]),('status','PASS')]:
                with self.subTest(kind=kind,field=field):
                    bad=copy.deepcopy(good);bad[field]=value
                    with mock.patch.object(contract,'ref',return_value=observation(bad)),self.assertRaises(c.Refused):contract.post_evidence(bad,a,kind,NOW+1,NOW+3)
            for k in good['checks']:
                with self.subTest(kind=kind,check=k):
                    bad=copy.deepcopy(good);bad['checks'].pop(k)
                    with mock.patch.object(contract,'ref',return_value=observation(bad)),self.assertRaises(c.Refused):contract.post_evidence(bad,a,kind,NOW+1,NOW+3)
    def test_postchecks_fail_on_hash_signature_transport(self):
        a=auth()
        for kind,field,value in [('github','signatureAccepted',False),('github','httpStatus',500),('upload','downloadSha256','0'*64),
                                 ('upload','largestRequestBytes',100000001),('upload','bytes',1),('functional','login',False)]:
            with self.subTest(field=field):
                p=post(a,kind,NOW+2);p['checks'][field]=value
                with mock.patch.object(contract,'ref',return_value=observation(p)),self.assertRaises(c.Refused):contract.post_evidence(p,a,kind,NOW+1,NOW+3)
    def test_wall_rollback_does_not_extend_deadline(self):
        wall=[100.];mono=[10.];d=contract.Deadline(110.,lambda:wall[0],lambda:mono[0]);wall[0]=1;mono[0]=21
        with self.assertRaises(c.Refused):d.check()
    def test_wall_forward_expires_immediately(self):
        wall=[100.];d=contract.Deadline(110.,lambda:wall[0],lambda:10.);wall[0]=111
        with self.assertRaises(c.Refused):d.check()
    def test_unit_has_independent_finalizer_and_no_secret(self):
        argv=window.systemd_command(Path('/opt/traceflow/releases')/RID/'deploy/scripts/release.py','a'*32,590)
        text=' '.join(argv)
        for token in ('Type=exec','RuntimeMaxSec=590','ExecStopPost=','finalize-first','KillMode=control-group','LimitCORE=0','Restart=no'):self.assertIn(token,text)
        self.assertNotIn('password',text);self.assertNotIn('DATABASE_URL',text)
        with self.assertRaises(c.Refused):window.systemd_command(Path('/tmp/controller'),'a'*32,590)

class CustodyTests(unittest.TestCase):
    def setUp(self):
        base=ROOT/'build';base.mkdir(exist_ok=True);self.temp=tempfile.TemporaryDirectory(prefix='tf0710-custody-',dir=base);self.p=Path(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_private_evidence_integrity_duplicate_json_and_extra_source(self):
        p=self.p/'proof';private_write(p,b'{"status":"fixture"}\n');r={'path':str(p),'sha256':c.file_digest(p)}
        self.assertEqual(contract.ref(r),{'status':'fixture'})
        p.write_bytes(b'{"x":1,"x":2}');r['sha256']=c.file_digest(p)
        with self.assertRaises(c.Refused):contract.ref(r)
        with self.assertRaises(c.Refused):contract.ref({**r,'extra':True})
    def test_symlink_writable_file_parent_owner_and_hash(self):
        p=self.p/'proof';private_write(p,b'{}');r={'path':str(p),'sha256':c.file_digest(p)}
        p.chmod(0o644)
        with self.assertRaises(c.Refused):contract.ref(r)
        p.chmod(0o600);r['sha256']='0'*64
        with self.assertRaises(c.Refused):contract.ref(r)
        alias=self.p/'alias';alias.symlink_to(p)
        with self.assertRaises(c.Refused):secure_read(alias,os.geteuid(),100,0o600)
        with self.assertRaises(c.Refused):secure_read(p,os.geteuid()+1,100,0o600)
        self.p.chmod(0o777)
        with self.assertRaises(c.Refused):secure_read(p,os.geteuid(),100,0o600)
        self.p.chmod(0o700)
    def test_exclusive_evidence_cannot_be_reused(self):
        p=self.p/'proof';private_write(p,b'{}')
        with self.assertRaises(FileExistsError):private_write(p,b'changed')
        self.assertEqual(p.read_bytes(),b'{}')

class WindowTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='tf0710-window-',dir=ROOT/'build');self.root=Path(self.temp.name)
        token='synthetic';c.atomic_json(self.root/'.traceflow-release-lab.json',{'token':token})
        self.env=mock.patch.dict(os.environ,{'TF_RELEASE_LAB_TOKEN':token});self.env.start()
        for d in ('opt/traceflow/releases','opt/traceflow/shared','var/www/traceflow'):(self.root/d).mkdir(parents=True)
        self.layout=ops.Layout(self.root);self.layout.initialize();state=self.layout.load();state['phase']='migration-complete';self.layout.save(state)
        self.a=auth();self.a.update(issuedAt=stamp(time.time()-1),expiresAt=stamp(time.time()+590))
        self.path=window.run_directory(self.layout,self.a['runId']);self.path.mkdir(parents=True,mode=0o700)
        private_write(self.path/'authorization.json',c.encoded(self.a));private_write(self.path/'prior-state.json',c.encoded(state))
        self.db=mock.Mock();self.db.ask.return_value={'fingerprint':'e'*64};self.account=mock.Mock();self.events=[]
        self.evidence=self.root/'var/lib/traceflow/test-evidence';self.evidence.mkdir(parents=True);(self.evidence/'keep').write_text('preserve')
    def tearDown(self):self.env.stop();self.temp.cleanup()
    def run_flow(self,fail=None,missing=False):
        original_phase=ops.phase
        def phase(layout,state,name):
            self.events.append(name);original_phase(layout,state,name)
            if name==fail:raise c.Refused('SYNTHETIC_FAILURE')
            if name=='postchecks-pending' and not missing:
                for kind in contract.POST:private_write(self.path/(kind+'.json'),c.encoded(post(self.a,kind,time.time())))
        def start(*args,**kwargs):
            self.assertIs(kwargs['public'],False)
            phase(self.layout,args[1],'starting-api');phase(self.layout,args[1],'starting-worker');return int(time.time()*1000)
        native=mock.Mock()
        command=mock.Mock(return_value=SimpleNamespace(stdout='MainPID='+str(os.getpid())+'\nType=exec\nKillMode=control-group\nRuntimeMaxUSec=10min\nExecStopPost=/usr/bin/python3 -I -B '+str(self.layout.releases/RID/'deploy/scripts/release.py')+' finalize-first --run-id '+self.a['runId']))
        with contextlib.ExitStack() as stack:
            for name,value in {'native_context':native,'command':command,'assert_stopped':mock.Mock(),'stop_services':mock.Mock(),
                'boot_id':mock.Mock(return_value='test-boot'),'proc_start':mock.Mock(return_value='123'),
                'Database':mock.Mock(return_value=self.db),'generation':mock.Mock(return_value='test-generation'),
                'start_services':mock.Mock(side_effect=start),'smoke':mock.Mock(),'phase':mock.Mock(side_effect=phase),'emit':mock.Mock()}.items():stack.enter_context(mock.patch.object(ops,name,value))
            stack.enter_context(mock.patch.object(self.layout,'installed',return_value=(self.layout.releases/RID,self.layout.admin/RID,manifest())))
            for name,value in {'load':mock.Mock(return_value=(self.path,self.a)), 'Accounts':mock.Mock(return_value=self.account),
                'pre_evidence':mock.Mock(),'checked_configs':mock.Mock(),'runtime_url':mock.Mock(return_value='synthetic-only'),
                'nginx_files':mock.Mock(),'nginx_reload':mock.Mock(),'temporary_probe':mock.Mock(),'cleanup_credential':mock.Mock()}.items():stack.enter_context(mock.patch.object(window,name,value))
            stack.enter_context(mock.patch.object(contract,'ref',side_effect=lambda r: observation(c.private_json(self.path/(r['path'].split('/')[-1]+'.json')))))
            if missing:
                d=mock.Mock();d.check.side_effect=[590]*7+[c.Refused('ACTIVATION_WINDOW_EXPIRED')]
                stack.enter_context(mock.patch.object(window,'Deadline',return_value=d));stack.enter_context(mock.patch.object(window.time,'sleep'))
            window.run(ops,self.layout,self.a['runId'])
    def test_success_only_after_postchecks_and_disconnect(self):
        self.run_flow();self.assertEqual(self.layout.load()['phase'],'complete')
        self.assertTrue(self.db.close.called);self.assertTrue((self.path/'verified.json').exists());self.assertFalse((self.path/'recovery.json').exists())
        self.assertLess(self.events.index('postchecks-pending'),self.events.index('database-disconnected'))
    def test_failure_every_phase_recovers_without_schema_or_data_changes(self):
        phases=('recovery-armed','accounts-enabled','switching','switched','starting-api','starting-worker','public-cutover','postchecks-pending','database-disconnected')
        # Fresh run directories are required for each failure; no replay of a prior fixture.
        for name in phases:
            with self.subTest(phase=name):
                child=WindowTests();child.setUp()
                try:
                    with self.assertRaisesRegex(c.Refused,'SYNTHETIC_FAILURE'):child.run_flow(fail=name)
                    self.assertEqual(child.layout.load()['phase'],'first-activation-recovered')
                    self.assertFalse(os.path.lexists(child.layout.app/'current'));self.assertFalse(os.path.lexists(child.layout.web/'current'))
                    self.assertEqual((child.evidence/'keep').read_text(),'preserve');self.assertTrue(child.account.relock.called)
                    self.assertFalse((child.path/'verified.json').exists())
                    self.assertEqual(c.private_json(child.path/'failure.json')['code'],'SYNTHETIC_FAILURE')
                finally:child.tearDown()
    def test_disconnect_failure_cannot_publish_success(self):
        self.db.close.side_effect=c.Refused('DATABASE_CLOSE_FAILED')
        with self.assertRaisesRegex(c.Refused,'DATABASE_CLOSE_FAILED'):self.run_flow()
        self.assertEqual(self.layout.load()['phase'],'first-activation-recovered');self.assertFalse((self.path/'verified.json').exists())
    def test_raw_failure_message_is_not_written_to_receipts(self):
        self.db.ask.side_effect=RuntimeError('synthetic-password SQL DATABASE_URL')
        with self.assertRaises(RuntimeError):self.run_flow()
        data=(self.path/'failure.json').read_text()
        self.assertNotIn('synthetic-password',data);self.assertNotIn('DATABASE_URL',data)
        self.assertEqual(c.private_json(self.path/'failure.json')['code'],'ACTIVATION_FAILED')
    def test_missing_postchecks_expires_and_recovers(self):
        with self.assertRaisesRegex(c.Refused,'ACTIVATION_WINDOW_EXPIRED'):self.run_flow(missing=True)
        self.assertEqual(self.layout.load()['phase'],'first-activation-recovered')
    def test_incomplete_recovery_never_returns_idle_or_approved(self):
        state=self.layout.load();state['web']='test';self.layout.save(state)
        self.account.relock.side_effect=c.Refused('DB_UNAVAILABLE')
        with mock.patch.object(ops,'stop_services'),mock.patch.object(window,'nginx_files'),mock.patch.object(window,'nginx_reload'),\
             mock.patch.object(window,'temporary_probe'),mock.patch.object(window,'cleanup_credential'):
            result=window.recover(ops,self.layout,self.path,self.a,self.account)
        self.assertEqual(result['status'],'INTERVENTION_REQUIRED');self.assertEqual(self.layout.load()['phase'],'recovery-incomplete')
        self.assertEqual(result['failedControls'],['accounts'])
    def test_replay_receipt_refused(self):
        window.receipt(self.path,'prepared',self.a)
        with self.assertRaises(FileExistsError):window.receipt(self.path,'prepared',self.a)
    def test_finalizer_corrupt_success_still_runs_recovery(self):
        private_write(self.path/'verified.json',b'{"status":"ACTIVATION_VERIFIED"}')
        with mock.patch.object(ops,'native_context'),mock.patch.object(window,'load',return_value=(self.path,self.a)),\
             mock.patch.object(window,'Accounts',return_value=self.account),mock.patch.object(window,'recover',return_value={'status':'TEMPORARY_PAGE_RESTORED'}) as recover:
            window.finalize(ops,self.layout,self.a['runId'])
        recover.assert_called_once()

class RuntimeAuditTests(unittest.TestCase):
    def rows(self,locked=True):
        u='traceflow_api';m=grants.MODEL;cid=23
        identity=['6e94bb7f-c601-11f1-9b91-02001704771f','26.7.0-cloud',3306,'traceflow_admin@%',cid,'public',0,1,1,1]
        rows={q['id']:[] for q in m['plan']}
        rows.update(IDENTITY_START=[identity],IDENTITY_END=[identity],SESSION_TLS=[['Ssl_cipher','TLS_AES_256_GCM_SHA384'],['Ssl_version','TLSv1.3']],
            MODEL=[[t,c] for t,cols in m['columns'].items() for c in cols],
            USER=[['10.20.1.184',u]+['N']*len(m['global'])+['ANY','Y' if locked else 'N',None]],
            SCHEMA=[['10.20.1.184','traceflow',u]+['Y' if k in ('Select_priv','Insert_priv','Update_priv','Delete_priv') else 'N' for k in m['schema']]],
            GRANTS=[['GRANT USAGE ON *.* TO `traceflow_api`@`10.20.1.184`'],['GRANT SELECT, INSERT, UPDATE, DELETE ON `traceflow`.* TO `traceflow_api`@`10.20.1.184`']])
        return rows,str(cid)
    def test_locked_and_unlocked_profiles_preserve_privilege_audit(self):
        for locked in (True,False):
            r,cid=self.rows(locked);out=grants.validate_audit(r,cid,grants.MODEL,'traceflow_api',locked)
            self.assertEqual(out['accountLocked'],locked);self.assertEqual(out['sourceCount'],15)
    def test_excessive_roles_proxy_dynamic_host_and_grants_refused(self):
        for source in ('PUBLIC','DYNAMIC','TABLE','COLUMN','ROUTINE','EDGES','DEFAULTS','PROXY','SCHEMA','USER','MODEL','GRANTS'):
            with self.subTest(source=source):
                r,cid=self.rows();r[source].append(['unexpected'])
                with self.assertRaises(c.Refused):grants.validate_audit(r,cid,grants.MODEL,'traceflow_api')
    def test_every_global_privilege_refused(self):
        for index,name in enumerate(grants.MODEL['global']):
            with self.subTest(name=name):
                r,cid=self.rows();r['USER'][0][2+index]='Y'
                with self.assertRaises(c.Refused):grants.validate_audit(r,cid,grants.MODEL,'traceflow_api')

class IntegratedGuardsTests(unittest.TestCase):
    def test_public_probe_runs_only_after_cutover(self):
        layout=SimpleNamespace(releases=Path('/synthetic/releases'),generations=Path('/synthetic/web'))
        db=mock.Mock();db.ask.return_value={'count':1,'fresh':True}
        with mock.patch.object(ops,'process_release',return_value=123),mock.patch.object(ops,'command',return_value=SimpleNamespace(stdout='LISTEN 0 10 127.0.0.1:3001 0.0.0.0:* users:(pid=123,fd=1)')),mock.patch.object(ops,'local_probe',return_value=(200,b'{}')),mock.patch.object(ops,'check_generation'),mock.patch.object(ops,'frontend_probe') as public:
            ops.smoke(layout,RID,{'web':'w'},auth(),db,1,public=False)
            public.assert_not_called()
            self.assertEqual(db.ask.call_count,2)
            ops.smoke(layout,RID,{'web':'w'},auth(),db,1,public=True)
            public.assert_called_once()
    def test_stop_failure_does_not_skip_worker(self):
        with mock.patch.object(ops,'command',side_effect=[c.Refused('STOP_FAILED'),None]) as cmd,mock.patch.object(ops,'assert_stopped'),self.assertRaisesRegex(c.Refused,'SERVICE_STOP_INCOMPLETE'):
            ops.stop_services()
        self.assertEqual([call.args[0][-1] for call in cmd.call_args_list],list(ops.SERVICES))
    def test_hardlinked_evidence_refused(self):
        with tempfile.TemporaryDirectory(prefix='tf0710-hardlink-',dir=ROOT/'build') as tmp:
            p=Path(tmp)/'proof';private_write(p,b'{}');os.link(p,Path(tmp)/'alias')
            with self.assertRaises(c.Refused):secure_read(p,os.geteuid(),100,0o600)
    def test_empty_observation_does_not_approve_public_test(self):
        a=auth();d=post(a,'github',NOW+2)
        with mock.patch.object(contract,'ref',return_value={}),self.assertRaisesRegex(c.Refused,'PUBLIC_OBSERVATION_REQUIRED'):
            contract.post_evidence(d,a,'github',NOW+1,NOW+3)
    def test_pre_receipts_validate_restore_and_actual_smtp_receipt(self):
        a=auth();m=manifest()
        backup={'status':'BACKUP_CAPTURE_ENCRYPTED','backupId':'f'*32,'payloadSha256':'1'*64,'manifestSha256':'2'*64}
        restored={**backup,'status':'ISOLATED_RESTORE_INTEGRITY_PASS','externalReadback':True,'externalManifestRecovered':True,'migrationRecords':68,'dataDigestsEqual':True,'structuresEqual':True,'recoveryConfigDigestsEqual':True,'productionDestination':False,'cleanup':True}
        smtp={'status':'SMTP_HOMOLOGATED','tlsAuthentication':'PASS','submissionResponse':250,'acceptedCount':1,'rejectedCount':0,'recipientConfirmation':'RECEIVED_IN_INBOX'}
        checks={'recovery':{'encrypted':True,'externalReadback':True,'restoreIntegrity':True,'custodyExternal':True},'smtp':{'tls':True,'authentication':True,'accepted':True,'receivedByOperator':True},'runtime':{'selinuxRestricted':True,'storage':True,'environment':True,'githubPrepared':True,'uploadTransportPrepared':True,'noOtherWriters':True}}
        docs={}
        for kind in contract.PRE:
            path='/synthetic/'+kind;a['preEvidence'][kind]={'path':path,'sha256':'a'*64}
            docs[path]={'formatVersion':1,'kind':kind,'status':'VERIFIED','observedAt':stamp(NOW),'serverUuid':contract.TARGET['serverUuid'],'chainSha256':m['schema']['chainSha256'],'configurationSha256':a['configurationSha256'],'sources':[{'path':'/source/'+kind,'sha256':'b'*64}],'checks':checks[kind]}
        docs['/synthetic/recovery']['sources'].append({'path':'/source/restore','sha256':'c'*64})
        docs.update({'/source/recovery':backup,'/source/restore':restored,'/source/smtp':smtp,'/source/runtime':{'operator':'synthetic'}})
        with mock.patch.object(contract,'ref',side_effect=lambda r:docs[r['path']]):
            contract.pre_evidence(a,m,NOW)
            for key,value in [('migrationRecords',67),('dataDigestsEqual',False),('productionDestination',True),('cleanup',False),('backupId','0'*32)]:
                original=restored[key];restored[key]=value
                with self.subTest(key=key),self.assertRaises(c.Refused):contract.pre_evidence(a,m,NOW)
                restored[key]=original
            docs['/source/smtp']={}
            with self.assertRaisesRegex(c.Refused,'SMTP_SOURCE_REQUIRED'):contract.pre_evidence(a,m,NOW)
            docs['/source/smtp']=smtp
            docs['/synthetic/runtime']['observedAt']=stamp(NOW-86401)
            with self.assertRaisesRegex(c.Refused,'PRE_RECEIPT_STALE'):contract.pre_evidence(a,m,NOW)

class BackupPolicyTests(unittest.TestCase):
    def test_bounded_plan_never_deletes(self):
        objects={'data':[],'prefixes':[]};self.assertEqual(backup.budget(objects,1024,0,'a'*32)['reservedRequests'],32)
        plan=backup.retention([{'backupId':'b'*32,'createdAt':stamp(NOW-20*86400),'preActivation':True},
                               {'backupId':'c'*32,'createdAt':stamp(NOW-20*86400),'preActivation':False}],NOW)
        self.assertFalse(plan['delete']);self.assertEqual(plan['reviewOnly'],['c'*32])
    def test_missing_inventory_pagination_capacity_budget_replay(self):
        for obj,size,used in [({'data':[],'prefixes':[],'next-start-with':'more'},1,0),({'data':[]},1,0),
                             ({'data':[],'prefixes':[]},backup.MAX_SET+1,0),({'data':[],'prefixes':[]},1,969),
                             ({'data':[{'name':'plain.sql','size':1}],'prefixes':[]},1,0),
                             ({'data':[{'name':'backups/'+'a'*32+'/payload.age','size':1}],'prefixes':[]},1,0)]:
            with self.subTest(obj=obj,size=size,used=used),self.assertRaises(c.Refused):backup.budget(obj,size,used,'a'*32)
    def test_retention_capacity_requires_review(self):
        rows=[{'name':'backups/'+f'{i:032x}'+'/payload.age','size':1} for i in range(16)]
        with self.assertRaisesRegex(c.Refused,'RETENTION_REVIEW'):backup.budget({'data':rows,'prefixes':[]},1,0,'a'*32)

if __name__=='__main__':unittest.main()
