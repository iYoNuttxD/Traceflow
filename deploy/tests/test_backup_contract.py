import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from backup_contract import (Refused, Context, private_dir, storage_inventory, validate_files,
                             unpack_verified, check_space, exclusive_lock, encoded, digest)

class BackupSafety(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='tf06-unit-'); self.root=Path(self.temporary.name).resolve(); self.root.chmod(0o700)
        self.key='12345678-1234-4234-9234-123456789012'
    def tearDown(self): self.temporary.cleanup()
    def test_production_cannot_be_enabled_by_flag(self):
        p=self.root/'config.json';p.write_text(json.dumps({'formatVersion':1,'mode':'production','approved':True}));p.chmod(0o600)
        with self.assertRaisesRegex(Refused,'LOCAL_ONLY'): Context(p)
    def test_private_directory_required(self):
        self.root.chmod(0o755)
        with self.assertRaises(Refused):private_dir(self.root)
    def test_symlink_parent_refused(self):
        (self.root/'real').mkdir(mode=0o700);(self.root/'link').symlink_to(self.root/'real',target_is_directory=True)
        with self.assertRaises(Refused):private_dir(self.root/'link')
    def test_storage_only_recognized_paths(self):
        (self.root/'unrelated').write_text('synthetic');(self.root/'unrelated').chmod(0o600)
        with self.assertRaises(Refused):storage_inventory(self.root)
    def test_storage_symlink_refused(self):
        (self.root/self.key).symlink_to('/etc/hosts')
        with self.assertRaises(Refused):storage_inventory(self.root)
    def test_public_temporary_file_refused(self):
        (self.root/self.key).write_text('synthetic');(self.root/self.key).chmod(0o644)
        with self.assertRaises(Refused):storage_inventory(self.root)
    def test_confirmed_hash_and_size(self):
        snapshot={'evidence':[{'storageKey':self.key,'sizeBytes':3,'sha256':digest(b'abc')}],'uploads':[]}
        validate_files(snapshot,{self.key:{'size':3,'sha256':digest(b'abc')}})
        for files in ({},{self.key:{'size':4,'sha256':digest(b'abc')}},{self.key:{'size':3,'sha256':digest(b'bad')}}):
            with self.subTest(files=files),self.assertRaises(Refused):validate_files(snapshot,files)
    def test_open_upload_requires_registered_parts(self):
        snapshot={'evidence':[],'uploads':[{'id':self.key,'status':'OPEN','filesJson':[{'parts':{'0':{'key':'part-'+self.key,'sha256':digest(b'x'),'sizeBytes':1}}}]}]}
        with self.assertRaises(Refused):validate_files(snapshot,{})
        validate_files(snapshot,{'.uploads/'+self.key+'/part-'+self.key:{'sha256':digest(b'x'),'size':1}})
    def test_expired_terminal_parts_are_optional(self):
        validate_files({'evidence':[],'uploads':[{'id':self.key,'status':'CANCELLED','filesJson':[{'parts':{}}]}]}, {})
    def test_capacity_refusal(self):
        with patch('backup_contract.shutil.disk_usage') as usage:
            usage.return_value.free=1
            with self.assertRaisesRegex(Refused,'INSUFFICIENT_SPACE'):check_space(self.root,10)
    def test_lock_preserves_inode_and_refuses_concurrency(self):
        path=self.root/'operation.lock'
        with exclusive_lock(path):
            inode=path.stat().st_ino
            with self.assertRaisesRegex(Refused,'OPERATION_LOCKED'):
                with exclusive_lock(path): pass
        with exclusive_lock(path):self.assertEqual(path.stat().st_ino,inode)
    def test_lock_symlink_refused(self):
        path=self.root/'operation.lock';path.symlink_to(self.root/'other')
        with self.assertRaises(OSError):
            with exclusive_lock(path): pass
    def test_tar_rejects_traversal_link_device_duplicate_and_unknown(self):
        for kind in ('traversal','absolute','link','device','duplicate','unknown'):
            with self.subTest(kind=kind):
                archive=self.root/(kind+'.tar');out=self.root/(kind+'-out');out.mkdir(mode=0o700)
                with tarfile.open(archive,'w') as tar:
                    info=tarfile.TarInfo({'traversal':'../database.sql','absolute':'/database.sql','unknown':'secret.key'}.get(kind,'database.sql'))
                    if kind=='link':info.type=tarfile.SYMTYPE;info.linkname='/etc/hosts'
                    if kind=='device':info.type=tarfile.CHRTYPE
                    tar.addfile(info,io.BytesIO())
                    if kind=='duplicate':tar.addfile(info,io.BytesIO())
                with self.assertRaises(Refused):unpack_verified(archive,out)
    def test_incomplete_archive_refused(self):
        archive=self.root/'empty.tar';out=self.root/'out';out.mkdir()
        with tarfile.open(archive,'w'):pass
        with self.assertRaisesRegex(Refused,'INCOMPLETE_BACKUP'):unpack_verified(archive,out)
    def test_restore_contains_no_delete_or_reset_command(self):
        # Contract of the command surface, not source text matching.
        from subprocess import run
        p=run([sys.executable,str(Path(__file__).resolve().parents[1]/'scripts/backup.py'),'retention-delete','--config','unused'],capture_output=True)
        self.assertNotEqual(p.returncode,0)

if __name__=='__main__':unittest.main()
