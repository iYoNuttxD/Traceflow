"""Fault injection confined to the synthetic harness; not an operational entry point."""
import importlib.util
import os
from pathlib import Path
import signal
import sys
sys.dont_write_bytecode=True
base=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(base/'lib'))
import backup_contract
original=backup_contract.run
operation=sys.argv[1]
def injected(args,**kwargs):
    if operation=='restore' and Path(args[0]).name=='mysql' and len(kwargs.get('input') or b'')>1000:
        original(args,input=b'CREATE TABLE RestoreInterrupted (id INT PRIMARY KEY);\n')
        os.kill(os.getpid(),signal.SIGTERM)
    if operation=='backup' and Path(args[0]).name=='age' and '--encrypt' in args:
        path=Path(args[args.index('--output')+1]);path.write_bytes(b'interrupted synthetic ciphertext')
        os.kill(os.getpid(),signal.SIGTERM)
    return original(args,**kwargs)
backup_contract.run=injected
spec=importlib.util.spec_from_file_location('backup_cli',base/'scripts/backup.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
sys.exit(module.main())
