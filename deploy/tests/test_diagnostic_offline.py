"""Offline packaging controls with synthetic archives; no native engine or database execution."""
import contextlib
import io
import json
from pathlib import Path
import shutil
import re
import tarfile
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'scripts'))
import package_diagnostic as p
import diagnostic_contract as d


class OfflinePackageTests(unittest.TestCase):
    def setUp(self):
        self.work = Path(tempfile.mkdtemp(prefix='tf0612-offline-test-')).resolve()
        self.source = self.work / 'source'
        self.source.mkdir(mode=0o700)
        for name in p.INPUTS:
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes((REPO / name).read_bytes())
            path.chmod(0o644)
        self.refresh_source()
        self.base = self.work / 'base'
        self.base.mkdir(mode=0o750)
        for name in d.FILES:
            path = self.base / name
            path.parent.mkdir(parents=True, exist_ok=True)
            data = b'public synthetic runtime fixture\n'
            if name in (*d.SOURCES, *d.DRIVERS):
                data = (self.source / name).read_bytes()
            if name.endswith(d.ENGINE):
                data = b'\x7fELF\x02\x01' + b'\0' * 12 + (183).to_bytes(2, 'little') + b'\0' * 32
            if name == 'backend/node_modules/.prisma/client/index.js':
                data = b'{"relativeEnvPaths": {"rootEnvPath": null}}'
            if name == 'backend/node_modules/@prisma/client/package.json':
                data = d.encoded({'version': '6.12.0'})
            if name == 'backend/node_modules/dotenv/package.json':
                data = d.encoded({'version': '16.6.1'})
            path.write_bytes(data)
            path.chmod(0o644)
        self.base_metadata = {
            'formatVersion': 1, 'kind': 'prisma-diagnostic', 'application': 'TraceFlow',
            'productionRelease': False, 'packageId': 'traceflow-prisma-diagnostic-' + 'a' * 16,
            'head': 'a' * 40, 'branch': 'synthetic', 'sourceState': 'working-tree-candidate',
            'sourceSha256': 'a' * 64, 'sourceFiles': self.proof['files'], 'includedLocalChanges': [],
            'nodeVersion': '22.23.2', 'npmVersion': '10.9.8', 'openssl': 'OpenSSL 3 synthetic',
            'prismaVersion': '6.12.0', 'engine': 'linux-arm64-openssl-3.0.x',
            'dependencies': {'@prisma/client': '6.12.0', 'dotenv': '16.6.1'},
            'platform': {'os': 'linux', 'architecture': 'arm64',
                         'distribution': 'Oracle Linux 9.8', 'opensslMajor': 3},
        }
        self.archive_sequence = 0
        self.refresh_base()
        self.output = self.work / 'output'

    def tearDown(self):
        shutil.rmtree(self.work)

    def refresh_source(self):
        self.proof = {
            'formatVersion': 1, 'kind': 'diagnostic-source', 'head': 'b' * 40, 'branch': 'daniel-dev',
            'sourceState': 'working-tree-candidate', 'includedLocalChanges': [],
            'files': {name: {'sha256': d.file_digest(self.source / name),
                             'size': (self.source / name).stat().st_size} for name in p.INPUTS},
        }
        (self.source / 'source.json').write_bytes(d.encoded(self.proof))
        (self.source / 'source.json').chmod(0o644)
        self.source_sha = d.file_digest(self.source / 'source.json')

    def refresh_base(self):
        self.archive_sequence += 1
        self.archive = self.work / ('base-' + str(self.archive_sequence) + '.tar.gz')
        self.base_receipt = d.pack(self.base, self.archive, self.base_metadata)

    def invoke(self, **overrides):
        args = SimpleNamespace(source=str(self.source), source_sha256=self.source_sha,
                               base_archive=str(self.archive), base_sha256=self.base_receipt['sha256'],
                               base_manifest_sha256=self.base_receipt['manifestSha256'], output=str(self.output))
        for name, value in overrides.items():
            setattr(args, name, value)
        def allowed_command(argv, **kwargs):
            self.assertEqual(argv, ['node', '-p', 'process.versions.node'])
            self.assertEqual(set(kwargs['env']), {'PATH', 'HOME', 'LANG', 'TZ'})
            return b'22.23.3\n'
        captured = io.StringIO()
        with patch.object(p, 'ROOT', self.source), patch.object(p, 'command', side_effect=allowed_command), \
                contextlib.redirect_stdout(captured):
            p.offline(args)
        result = json.loads(captured.getvalue())
        self.assertEqual(result['status'], 'PACKAGED_OFFLINE')
        self.assertEqual(len(captured.getvalue().splitlines()), 1)
        return result

    def test_verified_dependencies_current_sources_and_provenance(self):
        before = self.archive.read_bytes()
        result = self.invoke()
        self.assertEqual(self.archive.read_bytes(), before)
        self.assertNotEqual(result['packageId'], self.base_metadata['packageId'])
        self.assertNotEqual(result['sha256'], self.base_receipt['sha256'])
        manifest = json.loads((self.output / 'manifest.json').read_bytes())
        self.assertEqual(set(manifest['sourceFiles']), set(p.INPUTS))
        self.assertEqual(manifest['nodeVersion'], '22.23.2')
        self.assertEqual(manifest['packager']['nodeVersion'], '22.23.3')
        self.assertEqual(manifest['validation'], {'nativeRuntime': 'NOT_EXECUTED', 'databaseConnection': False})
        installed = self.work / 'installed'
        d.extract(self.output / result['file'], result['sha256'], result['manifestSha256'], installed)
        for name in d.DEPENDENCIES:
            self.assertEqual((installed / name).read_bytes(), (self.base / name).read_bytes())
            self.assertEqual(manifest['runtimeProvenance']['files'][name], manifest['files'][name])
        for name in (*d.SOURCES, *d.DRIVERS):
            self.assertEqual((installed / name).read_bytes(), (self.source / name).read_bytes())
        self.assertEqual(set(d.inventory(installed)), d.FILES)

    def legacy_base(self, omit=None, extra=None):
        names = set(d.LEGACY_FILES)
        if omit:
            names.remove(omit)
        contents = {name: (self.base / name).read_bytes() for name in names}
        if extra:
            contents[extra] = b'unexpected synthetic content'
        metadata = dict(self.base_metadata, files={
            name: {'sha256': d.digest(data), 'size': len(data), 'mode': 0o644}
            for name, data in contents.items()})
        metadata['sourceFiles'] = dict(metadata['sourceFiles'])
        # The old verifier recipe is not a reusable native dependency.
        metadata['sourceFiles']['deploy/lib/diagnostic_contract.py'] = {'sha256': '0' * 64, 'size': 1}
        manifest = d.encoded(metadata)
        contents['manifest.json'] = manifest
        self.archive = self.work / 'legacy-synthetic.tar.gz'
        with tarfile.open(self.archive, 'w:gz', format=tarfile.USTAR_FORMAT) as tar:
            for name, data in sorted(contents.items()):
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = 0o644
                tar.addfile(info, io.BytesIO(data))
        self.base_receipt = {'sha256': d.file_digest(self.archive), 'manifestSha256': d.digest(manifest)}

    def test_legacy_base_reuses_only_verified_dependencies_and_includes_all_current_modules(self):
        self.legacy_base()
        before = self.archive.read_bytes()
        with self.assertRaises(d.Refused):
            d.extract(self.archive, self.base_receipt['sha256'],
                      self.base_receipt['manifestSha256'], self.work / 'not-current')
        result = self.invoke()
        self.assertEqual(before, self.archive.read_bytes())
        manifest = json.loads((self.output / 'manifest.json').read_bytes())
        self.assertEqual(set(manifest['files']), d.FILES)
        self.assertEqual(manifest['runtimeProvenance']['archiveSha256'], self.base_receipt['sha256'])
        self.assertNotEqual(result['sha256'], self.base_receipt['sha256'])

    def test_incomplete_legacy_base_refused(self):
        self.legacy_base(omit='backend/node_modules/dotenv/LICENSE')
        with self.assertRaisesRegex(d.Refused, 'MANIFEST_ALLOWLIST'):
            self.invoke()
        self.assertFalse(self.output.exists())

    def test_legacy_base_unknown_member_refused(self):
        self.legacy_base(extra='unexpected.txt')
        with self.assertRaisesRegex(d.Refused, 'ARCHIVE_ALLOWLIST'):
            self.invoke()
        self.assertFalse(self.output.exists())

    def test_legacy_base_still_requires_both_pins(self):
        self.legacy_base()
        for field in ('base_sha256', 'base_manifest_sha256'):
            with self.subTest(field=field), self.assertRaises(d.Refused):
                self.invoke(**{field: '0' * 64})
            self.assertFalse(self.output.exists())

    def test_legacy_base_preserves_native_input_guards(self):
        self.legacy_base()
        path = self.source / 'backend/package-lock.json'
        path.write_bytes(path.read_bytes() + b'\n')
        self.refresh_source()
        with self.assertRaisesRegex(d.Refused, 'REUSE_INPUT_CHANGED'):
            self.invoke()

    def test_current_runtime_inventory_closes_relative_imports(self):
        for name in (*d.SOURCES, *d.DRIVERS):
            if not name.endswith(('.js', '.mjs')):
                continue
            text = (REPO / name).read_text()
            pattern = r"(?:from\s+|import\(\s*)['\"](\.[^'\"]+)['\"]"
            for relative in re.findall(pattern, text):
                target = ((REPO / name).parent / relative).resolve().relative_to(REPO).as_posix()
                self.assertIn(target, d.FILES, (name, relative))
        self.assertNotIn('deploy/tests/administrative-runtime.test.mjs', d.FILES)
        self.assertTrue(all('/test' not in name and not name.endswith('.md') for name in d.FILES))


    def test_reproducible_offline_bytes(self):
        first = self.invoke()
        second_dir = self.work / 'second'
        second = self.invoke(output=str(second_dir))
        self.assertEqual(first, second)
        self.assertEqual((self.output / first['file']).read_bytes(), (second_dir / second['file']).read_bytes())

    def test_wrong_base_pins_refused_before_publication(self):
        for field in ('base_sha256', 'base_manifest_sha256'):
            with self.subTest(field=field), self.assertRaises(d.Refused):
                self.invoke(**{field: '0' * 64})
            self.assertFalse(self.output.exists())

    def test_changed_generator_inputs_refused(self):
        for name in ('backend/package-lock.json', 'backend/prisma/schema.prisma',
                     'backend/src/database/prismaClient.js'):
            path = self.source / name
            saved = path.read_bytes()
            path.write_bytes(saved + b'\n')
            self.refresh_source()
            with self.subTest(name=name), self.assertRaisesRegex(d.Refused, 'REUSE_INPUT_CHANGED'):
                self.invoke()
            self.assertFalse(self.output.exists())
            path.write_bytes(saved)
            self.refresh_source()

    def test_missing_or_unexpected_source_refused(self):
        extra = self.source / 'unexpected.txt'
        extra.write_text('public synthetic fixture')
        with self.assertRaisesRegex(d.Refused, 'SOURCE_INVENTORY'):
            self.invoke()
        extra.unlink()
        (self.source / p.REVIEW_INPUTS[0]).unlink()
        with self.assertRaisesRegex(d.Refused, 'SOURCE_INVENTORY'):
            self.invoke()
        self.assertFalse(self.output.exists())

    def test_source_digest_and_recipe_mismatch_refused(self):
        with self.assertRaisesRegex(d.Refused, 'SOURCE_TRUST'):
            self.invoke(source_sha256='0' * 64)
        recipe = self.source / 'scripts/package_diagnostic.py'
        recipe.write_bytes(recipe.read_bytes() + b'\n# synthetic changed recipe\n')
        self.refresh_source()
        args = SimpleNamespace(source=str(self.source), source_sha256=self.source_sha)
        with patch.object(p, 'ROOT', REPO), self.assertRaisesRegex(d.Refused, 'RECIPE_MISMATCH'):
            p.verified_source(args)
        self.assertFalse(self.output.exists())

    def test_changed_dependency_version_refused(self):
        path = self.base / 'backend/node_modules/@prisma/client/package.json'
        path.write_bytes(d.encoded({'version': '6.13.0'}))
        self.refresh_base()
        with self.assertRaisesRegex(d.Refused, 'DEPENDENCY_VERSION'):
            self.invoke()
        self.assertFalse(self.output.exists())

    def test_dotenv_discovery_refused(self):
        path = self.base / 'backend/node_modules/.prisma/client/index.js'
        path.write_bytes(b'{"relativeEnvPaths": {"rootEnvPath": ".env"}}')
        self.refresh_base()
        with self.assertRaisesRegex(d.Refused, 'GENERATED_ENV_DISCOVERY'):
            self.invoke()
        self.assertFalse(self.output.exists())

    def test_existing_output_preserved(self):
        self.output.mkdir()
        sentinel = self.output / 'preserve'
        sentinel.write_text('keep')
        with self.assertRaisesRegex(d.Refused, 'OUTPUT_EXISTS'):
            self.invoke()
        self.assertEqual(sentinel.read_text(), 'keep')

    def test_reused_package_id_refused(self):
        self.base_metadata['packageId'] = 'traceflow-prisma-diagnostic-' + self.source_sha[:16]
        self.refresh_base()
        with self.assertRaisesRegex(d.Refused, 'PACKAGE_ID_REUSED'):
            self.invoke()
        self.assertFalse(self.output.exists())

    def test_native_dependency_toolchain_mismatch_refused(self):
        self.base_metadata['nodeVersion'] = '22.23.3'
        self.refresh_base()
        with self.assertRaisesRegex(d.Refused, 'BASE_NODE_VERSION'):
            self.invoke()
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
