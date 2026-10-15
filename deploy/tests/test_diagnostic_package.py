"""Adversarial artifact tests; fixtures are not executable Prisma packages."""
import copy
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tarfile
import tempfile
import unittest
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
import diagnostic_contract as d


class DiagnosticArchiveTests(unittest.TestCase):
    def setUp(self):
        self.work = Path(tempfile.mkdtemp(prefix='tf061-package-test-')).resolve()
        self.tree = self.work / 'tree'
        self.tree.mkdir(mode=0o750)
        for name in d.FILES:
            path = self.tree / name
            path.parent.mkdir(parents=True, exist_ok=True)
            data = b'public synthetic fixture\n'
            if name.endswith(d.ENGINE):
                data = b'\x7fELF\x02\x01' + b'\0' * 12 + (183).to_bytes(2, 'little') + b'\0' * 32
            path.write_bytes(data)
            path.chmod(0o644)
        self.metadata = {
            'formatVersion': 1, 'kind': 'prisma-diagnostic', 'application': 'TraceFlow',
            'productionRelease': False, 'head': 'a' * 40, 'sourceSha256': 'b' * 64,
            'packageId': 'traceflow-prisma-diagnostic-' + 'b' * 16, 'sourceState': 'working-tree-candidate',
            'sourceFiles': {}, 'includedLocalChanges': [], 'nodeVersion': '22.23.2',
            'prismaVersion': '6.12.0', 'engine': 'linux-arm64-openssl-3.0.x',
            'platform': {'os': 'linux', 'architecture': 'arm64', 'distribution': 'Oracle Linux 9.8', 'opensslMajor': 3}}
        self.archive = self.work / 'candidate.tar.gz'
        self.receipt = d.pack(self.tree, self.archive, self.metadata)

    def tearDown(self):
        shutil.rmtree(self.work)

    def extract(self, archive=None, sha=None, manifest=None):
        return d.extract(archive or self.archive, sha or self.receipt['sha256'],
                         manifest or self.receipt['manifestSha256'], self.work / 'installed')

    def malicious(self, mutate):
        output = self.work / 'adverse.tar.gz'
        with tarfile.open(self.archive, 'r:gz') as old, tarfile.open(output, 'w:gz') as new:
            entries = [(m, old.extractfile(m).read()) for m in old]
            for member, data in mutate(entries):
                new.addfile(member, io.BytesIO(data) if member.isfile() else None)
        return output

    def test_round_trip_and_reproducibility(self):
        value = self.extract()
        self.assertEqual(set(value['files']), d.FILES)
        second = self.work / 'second.tar.gz'
        receipt = d.pack(self.tree, second, self.metadata)
        self.assertEqual(receipt['sha256'], self.receipt['sha256'])
        self.assertEqual(second.read_bytes(), self.archive.read_bytes())

    def test_checksum_and_manifest_pins(self):
        for field in ('sha', 'manifest'):
            with self.subTest(field=field), self.assertRaises(d.Refused):
                self.extract(**{field: '0' * 64})
            self.assertFalse((self.work / 'installed').exists())

    def test_malicious_archive_members(self):
        for kind in ('absolute', 'traversal', 'duplicate', 'symlink', 'hardlink', 'unlisted', 'directory'):
            def mutate(entries):
                m = copy.copy(entries[0][0]); data = entries[0][1]
                if kind == 'absolute': m.name = '/tmp/outside'
                if kind == 'traversal': m.name = '../outside'
                if kind == 'duplicate': return entries + [entries[0]]
                if kind in ('symlink', 'hardlink'):
                    m.type = tarfile.SYMTYPE if kind == 'symlink' else tarfile.LNKTYPE
                    m.linkname = '/etc/passwd'; m.size = 0
                if kind == 'unlisted': m.name = '.env'
                if kind == 'directory': m.type = tarfile.DIRTYPE; m.size = 0
                return [(m, data), *entries[1:]]
            archive = self.malicious(mutate)
            with self.subTest(kind=kind), self.assertRaises(d.Refused):
                self.extract(archive, d.file_digest(archive))
            self.assertFalse((self.work / 'installed').exists())

    def test_content_change_with_valid_outer_checksum(self):
        def mutate(entries):
            m, data = entries[0]
            return [(m, b'X' + data[1:]), *entries[1:]]
        archive = self.malicious(mutate)
        with self.assertRaises(d.Refused):
            self.extract(archive, d.file_digest(archive))
        self.assertFalse((self.work / 'installed').exists())

    def test_does_not_replace_existing_directory(self):
        installed = self.work / 'installed'; installed.mkdir()
        sentinel = installed / 'keep'; sentinel.write_text('preserve')
        with self.assertRaises(d.Refused): self.extract()
        self.assertEqual(sentinel.read_text(), 'preserve')

    def test_unexpected_tree_content_and_permissions(self):
        for kind in ('file', 'directory', 'symlink', 'hardlink', 'open-mode'):
            path = self.tree / ('unexpected' if kind != 'open-mode' else 'backend/package.json')
            if kind == 'file': path.write_text('public')
            if kind == 'directory': path.mkdir()
            if kind == 'symlink': path.symlink_to('/etc/passwd')
            if kind == 'hardlink': os.link(self.tree / 'backend/package.json', path)
            if kind == 'open-mode': path.chmod(0o666)
            with self.subTest(kind=kind), self.assertRaises(d.Refused):
                d.verify_tree(self.tree, self.receipt['manifestSha256'])
            if kind == 'directory': path.rmdir()
            elif kind == 'open-mode': path.chmod(0o644)
            else: path.unlink()

    def test_native_architecture_and_forbidden_material(self):
        name = 'backend/node_modules/.prisma/client/' + d.ENGINE
        data = bytearray((self.tree / name).read_bytes()); data[18:20] = (62).to_bytes(2, 'little')
        with self.assertRaisesRegex(d.Refused, 'ENGINE_ARCHITECTURE'): d.scan(name, data)
        for value in (b'mysql:' + b'//synthetic:synthetic@127.0.0.1',
                      b'-----BEGIN ' + b'PRIVATE KEY-----\n' + b'A' * 64,
                      b'ghp_' + b'A' * 40):
            with self.assertRaises(d.Refused): d.scan('backend/package.json', value)

    def test_missing_dependency_and_changed_file(self):
        path = self.tree / 'backend/node_modules/dotenv/lib/main.js'; original = path.read_bytes()
        path.unlink()
        with self.assertRaises(d.Refused): d.verify_tree(self.tree, self.receipt['manifestSha256'])
        path.write_bytes(original + b'change'); path.chmod(0o644)
        with self.assertRaises(d.Refused): d.verify_tree(self.tree, self.receipt['manifestSha256'])


if __name__ == '__main__':
    unittest.main()
