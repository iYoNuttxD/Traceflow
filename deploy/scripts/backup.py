#!/usr/bin/env python3
"""OCI06 local validation CLI. Production operation is deliberately not enabled."""
import argparse
import json
import os
from pathlib import Path
import signal
import sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from backup_contract import Context, exclusive_lock, Refused, require

def interrupted(*_): raise Refused('INTERRUPTED')

def main():
    os.umask(0o077)
    signal.signal(signal.SIGTERM,interrupted); signal.signal(signal.SIGINT,interrupted)
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation',choices=['backup','verify','restore'])
    p.add_argument('--config',required=True)
    p.add_argument('--backup'); p.add_argument('--manifest-sha256'); p.add_argument('--identity')
    args=p.parse_args()
    try:
        with Context(args.config) as context:
            with exclusive_lock(context.state/'operation.lock'):
                if args.operation=='backup': result=context.backup()
                else:
                    require(all((args.backup,args.manifest_sha256,args.identity)),'RESTORE_ARGUMENTS_REQUIRED')
                    if args.operation=='restore': result=context.restore(args.backup,args.manifest_sha256,args.identity)
                    else:
                        outer,*_=context.verified_set(args.backup,args.manifest_sha256,args.identity)
                        result={'status':'INTEGRITY_VALID','backupId':outer['backupId'],'restored':False}
        print(json.dumps(result)); return 0
    except BaseException as error:
        code=str(error) if isinstance(error,Refused) else 'BACKUP_OPERATION_FAILED'
        print(json.dumps({'status':'FAIL','code':code})); return 1
if __name__=='__main__': sys.exit(main())
