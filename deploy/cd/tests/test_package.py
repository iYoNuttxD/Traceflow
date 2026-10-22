import hashlib,importlib.util,json,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('cd_package',Path(__file__).resolve().parents[1]/'package.py');pkg=importlib.util.module_from_spec(spec);spec.loader.exec_module(pkg)
class SourceProvenanceTests(unittest.TestCase):
 def fixture(self,d):
  source=d/'source';source.mkdir()
  for name in ['backend/package-lock.json','frontend/package-lock.json']:
   p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('{"input":"committed-lock"}')
  subprocess.run(['git','init','-q',str(source)],check=True)
  subprocess.run(['git','add','.'],cwd=source,check=True)
  subprocess.run(['git','-c','user.name=CD Test','-c','user.email=cd-test@example.invalid','-c','commit.gpgsign=false','commit','-qm','synthetic source'],cwd=source,check=True)
  commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
  root=d/'root'
  for name,data in {'backend/src/server.js':'synthetic','frontend/index.html':'synthetic','backend/prisma/schema.prisma':'synthetic','backend/prisma/migrations/first/migration.sql':'synthetic','backend/package-lock.json':'{"output":"normalized-pruned-lock"}','backend/node_modules/@prisma/client/package.json':'{"version":"6.12.0"}'}.items():
   p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(data)
  return source,commit,root
 def test_generated_output_lock_is_distinct_and_bound_to_clean_committed_input(self):
  with tempfile.TemporaryDirectory() as folder:
   d=Path(folder);source,commit,root=self.fixture(d);other=d/'other';shutil.copytree(root,other)
   one=pkg.pack(root,d/'one.tgz',commit,1,source_root=source);two=pkg.pack(other,d/'two.tgz',commit,1,source_root=source)
   self.assertEqual(one['packageSha256'],two['packageSha256'])
   m=json.loads((root/'cd-manifest.json').read_bytes());expected=hashlib.sha256((source/'backend/package-lock.json').read_bytes()).hexdigest()
   self.assertEqual(m['sourceState'],'committed');self.assertEqual(m['sourceLockfiles']['backend/package-lock.json'],expected)
   self.assertNotEqual(m['files']['backend/package-lock.json']['sha256'],expected)
 def test_mutated_source_is_refused_without_restoring_or_masking_it(self):
  with tempfile.TemporaryDirectory() as folder:
   d=Path(folder);source,commit,root=self.fixture(d);(source/'backend/package-lock.json').write_text('changed')
   with self.assertRaises(subprocess.CalledProcessError):pkg.pack(root,d/'refused.tgz',commit,1,source_root=source)
   self.assertFalse((d/'refused.tgz').exists());self.assertEqual((source/'backend/package-lock.json').read_text(),'changed')

 def test_test_result_cache_is_refused_in_runtime_package(self):
  with tempfile.TemporaryDirectory() as folder:
   d=Path(folder);source,commit,root=self.fixture(d);cache=root/'backend/node_modules/.vite/vitest/results.json';cache.parent.mkdir(parents=True);cache.write_text('{"duration":1}')
   with self.assertRaisesRegex(ValueError,'BUILD_CACHE_IN_RUNTIME'):pkg.pack(root,d/'refused.tgz',commit,1,source_root=source)
   self.assertFalse((d/'refused.tgz').exists())
