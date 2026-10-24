import importlib.util,io,json,tempfile,unittest,datetime as dt
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('live_operations',ROOT/'deploy/operations/live_operations.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)

class OperationsTests(unittest.TestCase):
 def test_native_dump_does_not_inherit_mysql_only_flags(self):
  with tempfile.TemporaryDirectory() as d,patch.dict(ops.os.environ,{'CREDENTIALS_DIRECTORY':d}):
   p=Path(d)/'mysql-backup';p.write_text('synthetic');
   with patch.object(ops.Path,'stat') as st:
    st.return_value.st_uid=0;st.return_value.st_mode=0o100600
    self.assertNotIn('--connect-timeout=5',ops.mysql_args('mysqldump'))
    self.assertNotIn('--local-infile=0',ops.mysql_args('mysqldump'))
 def test_sql_escapes_and_unicode(self):
  self.assertEqual(ops.sql_values("'ação, teste','a\\\'b','line\\nnext',NULL,42,0xA0"),['ação, teste',"a'b",'line\nnext',None,'42','0xA0'])
 def test_sql_rejects_unterminated(self):
  with self.assertRaises(ops.Refused):ops.sql_values("'missing")
 def test_sql_does_not_evaluate(self):
  with self.assertRaises(ops.Refused):ops.sql_values('__import__(1)')
 def test_row_digest_is_order_independent(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'dump';header='CREATE TABLE `Example` (\n  `id` int NOT NULL,\n  PRIMARY KEY (`id`)\n) ENGINE=InnoDB AUTO_INCREMENT=3;\n'
   a="INSERT INTO `Example` (`id`) VALUES (1);\n";b="INSERT INTO `Example` (`id`) VALUES (2);\n"
   p.write_text(header+a+b);first=ops.dump_manifest(p)
   p.write_text(header+b+a);self.assertEqual(first,ops.dump_manifest(p));self.assertEqual(first['tables']['Example']['rows'],2)
 def test_migration_receipt_requires_finished(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'dump';p.write_text('CREATE TABLE `_prisma_migrations` (\n `id` varchar(1)\n);\n'+"INSERT INTO `_prisma_migrations` (`migration_name`,`checksum`,`finished_at`,`rolled_back_at`) VALUES ('x','h',NULL,NULL);\n")
   with self.assertRaises(ops.Refused):ops.dump_manifest(p)
 def test_references_match_exact_bytes(self):
  snap={'evidence':[{'storageKey':'id','sizeBytes':79,'sha256':'x'}],'uploadParts':[]}
  ops.validate_references(snap,{'id':{'sizeBytes':79,'sha256':'x'}})
  with self.assertRaises(ops.Refused):ops.validate_references(snap,{'id':{'sizeBytes':78,'sha256':'x'}})
 def test_traversal_refused(self):
  with self.assertRaises(ops.Refused):ops.validate_references({'evidence':[{'storageKey':'../id'}],'uploadParts':[]},{})
 def test_retention_preserves_legacy_and_two_latest(self):
  rows=[]
  for day in range(1,5):rows.append({'name':ops.PREFIX+'2026010'+str(day)+'T000000Z-'+'a'*32+'.tar.gz.age','time-created':'2026-01-0'+str(day)+'T00:00:00+00:00','etag':'etag'})
  rows.append({'name':'backups/legacy/payload.age','time-created':'2025-01-01T00:00:00+00:00','etag':'legacy'})
  with tempfile.TemporaryDirectory() as d,patch.object(ops,'STATE',Path(d)),patch.object(ops,'oci') as remote:
   ops.retire({'retentionDays':14,'namespace':'n','bucket':'b'},rows)
   self.assertEqual(remote.call_count,2)
   self.assertTrue(all('backups/legacy/payload.age' not in args[0][1] for args in remote.call_args_list))
 def test_request_metrics_ignore_unstructured_or_personal_logs(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'log';p.write_text(json.dumps({'time':dt.datetime.now(dt.timezone.utc).isoformat(),'duration':3,'status':503})+'\nnot-json\n')
   v=ops.log_metrics(p,ops.time.time());self.assertEqual(v,{'requests5m':1,'http5xx5m':1,'p95Seconds5m':3})
 def test_hashing_writer_covers_all_bytes(self):
  target=io.BytesIO();s=ops.HashingWriter(target);s.write(b'abc');s.write(b'def');s.flush()
  self.assertEqual(s.hash.hexdigest(),ops.hashlib.sha256(b'abcdef').hexdigest());self.assertEqual(s.size,6)
 def test_environment_keeps_secret_in_memory(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'env';p.write_text('A="value with spaces"\nB="escaped\\\\value"\n')
   self.assertEqual(ops.environment(p),{'A':'value with spaces','B':'escaped\\value'})
 def test_backup_sql_is_readonly_and_tls_enforced(self):
  with self.assertRaises(ops.Refused):ops.sql('DELETE FROM User')
  self.assertNotIn('--databases',ops.DUMP_FLAGS)
  self.assertIn('--single-transaction',ops.DUMP_FLAGS)
  self.assertNotIn('--lock-all-tables',ops.DUMP_FLAGS)

if __name__=='__main__':unittest.main()
