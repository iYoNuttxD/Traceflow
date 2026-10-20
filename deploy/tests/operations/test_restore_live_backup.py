import importlib.util,io,json,sys,tarfile,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'deploy/operations'))
import restore_live_backup as restore

class RestoreTests(unittest.TestCase):
 def archive(self,folder,members):
  p=folder/'archive.tar.gz'
  with tarfile.open(p,'w:gz') as t:
   for name,value,kind in members:
    x=tarfile.TarInfo(name);x.type=kind;x.size=len(value);t.addfile(x,io.BytesIO(value))
  return p
 def test_snapshot_diagnostic_preserves_all_checks(self):
  a={'tables':{'Example':{'rows':1,'dataSha256':'a','structureSha256':'s','foreignKeys':0}},'migrations':[]}
  b={'tables':{'Example':{'rows':1,'dataSha256':'b','structureSha256':'s','foreignKeys':0}},'migrations':[]}
  self.assertEqual(restore.snapshot_differences(a,a),{'tables':{},'otherComponents':{}})
  self.assertIn('Example',restore.snapshot_differences(a,b)['tables'])
  self.assertEqual(restore.snapshot_differences(a,b)['tables']['Example']['restored']['dataSha256'],'b')
 def test_only_redundant_utf8mb4_charset_is_canonicalized(self):
  a="CREATE TABLE `x` (\n `s` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'\n) AUTO_INCREMENT=5;\n"
  b=a.replace('varchar(20) COLLATE','varchar(20) CHARACTER SET utf8mb4 COLLATE')
  self.assertEqual(restore.canonical_ddl(a),restore.canonical_ddl(b))
  self.assertIn("DEFAULT 'CHARACTER SET utf8mb4 COLLATE",restore.canonical_ddl(b))
  for changed in [b.replace('varchar(20)','varchar(21)'),b.replace('COLLATE utf8mb4_unicode_ci DEFAULT','COLLATE utf8mb4_bin DEFAULT'),b.replace('CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT','CHARACTER SET latin1 COLLATE latin1_swedish_ci DEFAULT'),b.replace('AUTO_INCREMENT=5','AUTO_INCREMENT=6'),b.replace("DEFAULT 'CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'","DEFAULT 'changed'")]:
   self.assertNotEqual(restore.canonical_ddl(a),restore.canonical_ddl(changed))
 def test_semantic_ddl_never_masks_data_or_provenance_changes(self):
  a={'tables':{'x':{'rows':1,'dataSha256':'a','structureSha256':'old','foreignKeys':0}},'migrations':[]}
  b={'tables':{'x':{'rows':1,'dataSha256':'a','structureSha256':'new','foreignKeys':0}},'migrations':[]}
  one={'x':'CREATE TABLE `x` (`s` varchar(20) COLLATE utf8mb4_unicode_ci);'}
  two={'x':one['x'].replace('COLLATE','CHARACTER SET utf8mb4 COLLATE')}
  self.assertTrue(restore.compare_database(a,b,one,two))
  b['tables']['x']['dataSha256']='changed';self.assertFalse(restore.compare_database(a,b,one,two))
  b['tables']['x']['dataSha256']='a';b['migrations']=[{'name':'changed'}];self.assertFalse(restore.compare_database(a,b,one,two))
 def test_complete_archive(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=self.archive(root,[('manifest.json',b'{"id":"synthetic"}',tarfile.REGTYPE),('database.sql',b'-- synthetic',tarfile.REGTYPE)])
   self.assertEqual(restore.unpack(p,root/'out',1000),{'id':'synthetic'})
 def test_traversal_symlink_unknown_and_incomplete_refused(self):
  for name,kind in [('../secret',tarfile.REGTYPE),('storage/link',tarfile.SYMTYPE),('unknown',tarfile.REGTYPE),('database.sql',tarfile.REGTYPE)]:
   with self.subTest(name=name),tempfile.TemporaryDirectory() as d:
    root=Path(d);p=self.archive(root,[(name,b'x',kind)])
    with self.assertRaises(restore.Refused):restore.unpack(p,root/'out',1000)
 def test_duplicate_and_capacity_refused(self):
  for members,limit in [([('manifest.json',b'{}',tarfile.REGTYPE)]*2,100),([('database.sql',b'1234',tarfile.REGTYPE)],3)]:
   with tempfile.TemporaryDirectory() as d:
    root=Path(d);p=self.archive(root,members)
    with self.assertRaises(restore.Refused):restore.unpack(p,root/'out',limit)

if __name__=='__main__':unittest.main()
