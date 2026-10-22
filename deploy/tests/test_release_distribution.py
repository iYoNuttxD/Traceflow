"""Distribution-policy regressions; public source and synthetic bytes only."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"deploy/lib"))
import release_contract as c

class DistributionPolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="tf072-policy-")
        self.file=Path(self.temp.name)/"fixture.js"
        self.file.write_text("export const fixture = true;\n")
    def tearDown(self):self.temp.cleanup()
    def test_exact_upload_source_module_remains_distributable(self):
        c.content_policy("backend/src/modules/testCases/uploads/upload-contract.js",self.file)
    def test_upload_data_and_adjacent_sources_remain_forbidden(self):
        for name in ("uploads/evidence.bin","backend/uploads/evidence.bin","backend/src/modules/testCases/uploads/data.json",
                     "backend/src/modules/testCases/uploads/upload-contract.js.env","backend/src/modules/testCases/Uploads/upload-contract.js",
                     "backend/src/modules/testCases/uploads/other.js","frontend/dist/uploads/upload-contract.js"):
            with self.subTest(name=name),self.assertRaisesRegex(c.Refused,"FORBIDDEN_CONTENT"):c.content_policy(name,self.file)
    def test_exact_source_exception_does_not_bypass_secret_checks(self):
        for value in ("-----BEGIN "+"PRIVATE KEY-----","ghp_"+"x"*40):
            self.file.write_text(value)
            with self.subTest(kind=value[:8]),self.assertRaisesRegex(c.Refused,"SECRET_PATTERN"):
                c.content_policy("backend/src/modules/testCases/uploads/upload-contract.js",self.file)
    def test_release_recipe_contains_initial_migration_helper(self):
        spec=importlib.util.spec_from_file_location("packaging",ROOT/"scripts/package_release.py")
        packaging=importlib.util.module_from_spec(spec);spec.loader.exec_module(packaging)
        self.assertIn("deploy/scripts/lib/migration-contract.mjs",packaging.RECIPES)

if __name__=="__main__":unittest.main()
