"""Synthetic backup publication and archive tests; never calls OCI or MySQL."""
import copy,datetime as dt,importlib.util,io,json,os,sys,tarfile,tempfile,unittest
from pathlib import Path
from unittest import mock
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'deploy/lib'))
import release_contract as c
import recovery_archive as archive
from operational_io import private_write
from activation_contract import timestamp
spec=importlib.util.spec_from_file_location('recovery_ops',ROOT/'deploy/scripts/recovery-backup.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='tf0710-recovery-',dir=ROOT/'build');self.root=Path(self.temp.name);self.ident='a'*32
        self.path=self.root/'sets'/self.ident;self.path.mkdir(parents=True,mode=0o700)
        for n in ('payload.age','manifest.json.age'):private_write(self.path/n,b'age-encryption.org/v1\nsynthetic-ciphertext-'+n.encode())
        self.capture={'status':'BACKUP_CAPTURE_ENCRYPTED','backupId':self.ident,'payloadSha256':c.file_digest(self.path/'payload.age'),
                      'manifestCipherSha256':c.file_digest(self.path/'manifest.json.age'),'restore':'NOT_REHEARSED'}
        c.atomic_json(self.path/'capture.json',self.capture)
        self.billing={'formatVersion':1,'month':dt.datetime.now(dt.timezone.utc).strftime('%Y-%m'),
                      'expiresAt':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=1)).isoformat().replace('+00:00','Z'),
                      'approved':True,'externalRequestsUsed':0}
        c.atomic_json(self.root/'capacity-authorization.json',self.billing)
        self.calls=[];self.fault=None
    def tearDown(self):self.temp.cleanup()
    def api(self,policy,args):
        self.calls.append(args)
        if args[:2]==['bucket','get']:
            return {'data':{'public-access-type':'ObjectRead' if self.fault=='public' else 'NoPublicAccess','storage-tier':'Standard','versioning':'Disabled'}}
        if args[:2]==['object','list']:return {'data':[],'prefixes':[],**({'next-start-with':'next'} if self.fault=='partial-list' else {})}
        if args[:2]==['object','put']:return {'output':'not overwritten'} if self.fault=='exists' else {'etag':'synthetic'}
        if args[:2]==['object','get']:
            dest=Path(args[args.index('--file')+1]);name=args[args.index('--name')+1].split('/')[-1]
            private_write(dest,b'corrupt' if self.fault=='readback' else (self.path/name).read_bytes());return None
        raise AssertionError('unreviewed OCI operation')
    def publish(self):
        def read(p,uid,max_size,mode):
            self.assertEqual(mode,0o600);self.assertEqual(Path(p).stat().st_mode&0o777,0o600);return Path(p).read_bytes()
        with mock.patch.object(ops,'STATE',self.root),mock.patch.object(ops,'oci',side_effect=self.api),mock.patch.object(ops,'secure_read',side_effect=read):
            return ops.publish({},self.ident)
    def test_encrypted_upload_readback_catalog_and_no_delete(self):
        r=self.publish();self.assertEqual(r['status'],'BACKUP_EXTERNAL_READBACK_PASS');self.assertEqual(r['restore'],'NOT_REHEARSED')
        self.assertEqual([x[:2] for x in self.calls],[['bucket','get'],['object','list'],['object','put'],['object','get'],['object','put'],['object','get']])
        for x in self.calls:
            if x[:2]==['object','put']:
                self.assertIn('--no-overwrite',x);self.assertIn('--no-multipart',x);self.assertTrue(x[-1].endswith('.age'))
        self.assertTrue((self.path/'external.json').exists())
    def test_private_bucket_required(self):
        self.fault='public'
        with self.assertRaisesRegex(c.Refused,'BUCKET_SECURITY'):self.publish()
        self.assertEqual(len(self.calls),1)
    def test_incomplete_listing_refused(self):
        self.fault='partial-list'
        with self.assertRaisesRegex(c.Refused,'INVENTORY_INCOMPLETE'):self.publish()
        self.assertFalse(any(x[:2]==['object','put'] for x in self.calls))
    def test_existing_object_not_treated_as_success(self):
        self.fault='exists'
        with self.assertRaisesRegex(c.Refused,'OBJECT_NOT_CREATED'):self.publish()
        self.assertFalse((self.path/'external.json').exists())
    def test_bad_readback_never_publishes_approval(self):
        self.fault='readback'
        with self.assertRaisesRegex(c.Refused,'READBACK_FAILED'):self.publish()
        self.assertFalse((self.path/'external.json').exists());self.assertTrue((self.path/'payload.age').exists())
    def test_expired_capacity_approval_no_calls(self):
        self.billing['expiresAt']='2020-01-01T00:00:00Z';c.atomic_json(self.root/'capacity-authorization.json',self.billing)
        with self.assertRaisesRegex(c.Refused,'CAPACITY_REVALIDATION'):self.publish()
        self.assertEqual(self.calls,[])
    def test_request_reservation_not_refunded_after_failure(self):
        self.fault='public'
        with self.assertRaises(c.Refused):self.publish()
        p=self.root/('requests-'+self.billing['month']+'.json');self.assertEqual(c.private_json(p),{'reserved':32})
    def test_ciphertext_tamper_refused_before_network(self):
        (self.path/'manifest.json.age').write_bytes(b'tampered')
        with self.assertRaisesRegex(c.Refused,'CIPHERTEXT_CHANGED'):self.publish()
        self.assertEqual(self.calls,[])
    def test_plaintext_is_never_transferred_even_with_correct_hash(self):
        (self.path/'payload.age').write_bytes(b'plain SQL');self.capture['payloadSha256']=c.file_digest(self.path/'payload.age');c.atomic_json(self.path/'capture.json',self.capture)
        with self.assertRaisesRegex(c.Refused,'CIPHERTEXT_FORMAT'):self.publish()
        self.assertFalse(any(x[:2]==['object','put'] for x in self.calls))
    def test_artifact_restore_format_preserves_inventory(self):
        files={'database.sql':b'synthetic SQL only','snapshot.json':b'{}',**{'recovery/'+n:b'synthetic-only' for n in ('runtime.env','api.env','github-worker.env','mysql-ca.pem')}}
        chain=[{'name':str(i),'sha256':'a'*64} for i in range(68)]
        common={'formatVersion':2,'application':'TraceFlow','backupId':self.ident,'createdAtUtc':timestamp(),'source':{'serverUuid':'synthetic'},
                'releaseId':'synthetic-release','runtimeManifestSha256':'a'*64,'consistency':'quiesced-writers-single-transaction-v1'}
        inner={**common,'status':'COMPLETE','schema':{'migrations':chain,'chainSha256':'b'*64},
               'accountsLocked':True,'servicesStopped':True,'queriesWarningCount':0,'operatorExternalWritersControlled':True,
               'files':{k:{'sha256':c.digest(v),'size':len(v)} for k,v in files.items()}}
        files['set.json']=c.encoded(inner);p=self.root/'payload.tar'
        with tarfile.open(p,'w',format=tarfile.USTAR_FORMAT) as tar:
            for name,data in files.items():
                m=tarfile.TarInfo(name);m.mode=0o600;m.size=len(data);tar.addfile(m,io.BytesIO(data))
        outer={**common,'archive':{'size':p.stat().st_size,'sha256':c.file_digest(p)},'innerManifestSha256':c.digest(files['set.json']),'chainSha256':'b'*64}
        restored,snapshot=archive.unpack(p,self.root/'restore-synthetic',outer)
        self.assertEqual(restored,inner);self.assertEqual(snapshot,{})
        with self.assertRaisesRegex(archive.Refused,'TARGET_EXISTS'):archive.unpack(p,self.root/'restore-synthetic',outer)
    def test_timer_is_only_a_template_and_requires_fresh_maintenance(self):
        service=(ROOT/'deploy/systemd/traceflow-recovery-backup.service').read_text()
        self.assertIn('--authorization /run/traceflow-recovery/authorization.json',service)
        self.assertNotIn('systemctl stop',service);self.assertNotIn('ACCOUNT UNLOCK',service)
        self.assertIn('Persistent=false',(ROOT/'deploy/systemd/traceflow-recovery-backup.timer').read_text())
if __name__=='__main__':unittest.main()
