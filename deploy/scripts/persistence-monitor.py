#!/usr/bin/env python3
"""Read-only local backup monitor and retention proposal. Never deletes or sends alerts."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import sys
import time
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'lib'))
from backup_contract import private_dir, private_json, file_digest, require, Refused

def evaluate(policy, copies, receipt, sensors, now):
    alerts=[]
    valid=[x for x in copies if x['valid'] and 0<=x['createdAt']<=now+30]
    if len(valid)!=len(copies):alerts.append('BACKUP_INVALID')
    latest=max(valid,key=lambda x:x['createdAt'],default=None)
    if not latest:alerts.append('NO_COMPLETE_BACKUP')
    elif now-latest['createdAt']>policy['maxBackupAgeSeconds']:alerts.append('BACKUP_TOO_OLD')
    restored=receipt and receipt.get('status')=='RESTORED_INTEGRITY_VALIDATED' and receipt.get('applicationSmoke')=='PASS' and any(x['manifestSha256']==receipt.get('manifestSha256') and x['backupId']==receipt.get('backupId') for x in valid)
    if not restored:alerts.append('RESTORE_NOT_REHEARSED')
    elif now-dt.datetime.fromisoformat(receipt['finishedAtUtc']).timestamp()>policy['maxRestoreAgeSeconds']:alerts.append('RESTORE_REHEARSAL_TOO_OLD')
    if not sensors or now-sensors.get('checkedAtEpoch',0)>policy['maxSensorAgeSeconds'] or sensors.get('checkedAtEpoch',0)>now+30:
        alerts.append('SENSORS_MISSING_OR_STALE')
    else:
        for key,expected,code in [('readiness',True,'MYSQL_OR_STORAGE_NOT_READY'),('liveness',True,'API_NOT_LIVE'),('workerHeartbeatFresh',True,'WORKER_HEARTBEAT_MISSING')]:
            if sensors.get(key)!=expected:alerts.append(code)
        if sensors.get('freeBytes',0)<policy['minFreeBytes']:alerts.append('DISK_LOW')
        if sensors.get('certificateRemainingDays',0)<policy['certificateWarningDays']:alerts.append('CERTIFICATE_EXPIRING')
        if sensors.get('poolBudgetExceeded') is not False:alerts.append('POOL_BUDGET_UNVERIFIED_OR_EXCEEDED')
        if sensors.get('maintenanceReviewRequired') is not False:alerts.append('MAINTENANCE_REVIEW_REQUIRED')
    # A plan is not authorization. Preserve newest minimum copies and the rehearsed set.
    protected={x['backupId'] for x in sorted(valid,key=lambda x:x['createdAt'],reverse=True)[:policy['minimumCopies']]}
    if restored:protected.add(receipt['backupId'])
    candidates=[x['backupId'] for x in valid if x['backupId'] not in protected and now-x['createdAt']>policy['retentionSeconds'] and not x.get('pinned',True)]
    return {'status':'ALERT' if alerts else 'HEALTHY','alerts':alerts,'retentionCandidates':candidates if policy.get('approved') and restored else [],'deletionImplemented':False,'externalNotifications':False}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',required=True);a=p.parse_args()
    try:
        config=private_json(Path(a.config).absolute());root=private_dir(config['backupRoot']);policy=config['policy']
        require(policy.get('minimumCopies',0)>=3,'MINIMUM_COPIES_REQUIRED')
        for key in ('maxBackupAgeSeconds','maxRestoreAgeSeconds','maxSensorAgeSeconds','minFreeBytes','certificateWarningDays','retentionSeconds'):
            require(isinstance(policy.get(key),int) and policy[key]>0,'MONITOR_POLICY_REQUIRED')
        copies=[]
        for path in sorted(root.iterdir()):
            if path.name.startswith('.'):continue
            record={'backupId':path.name,'valid':False}
            try:
                private_dir(path);m=private_json(path/'manifest.json')
                record.update(manifestSha256=file_digest(path/'manifest.json'),createdAt=dt.datetime.fromisoformat(m['createdAtUtc']).timestamp(),pinned=m.get('pinned',True))
                payload=path/'payload.age'
                require(not payload.is_symlink() and payload.is_file(),'PAYLOAD_PATH')
                record['valid']=m['status']=='COMPLETE' and m['encrypted'] is True and payload.stat().st_size==m['payload']['size'] and file_digest(payload)==m['payload']['sha256']
            except (OSError,ValueError,KeyError,Refused):pass
            copies.append(record)
        receipt=private_json(Path(config['restoreReceipt'])) if config.get('restoreReceipt') else None
        sensors=private_json(Path(config['sensorSnapshot'])) if config.get('sensorSnapshot') else None
        result=evaluate(policy,copies,receipt,sensors,time.time())
        result['localFreeBytes']=shutil.disk_usage(root).free
        if result['localFreeBytes']<policy['minFreeBytes']:result['status']='ALERT';result['alerts'].append('BACKUP_DISK_LOW')
        print(json.dumps(result));return 0 if result['status']=='HEALTHY' else 2
    except Exception:
        print(json.dumps({'status':'ALERT','alerts':['MONITOR_CONFIGURATION_OR_INPUT_INVALID'],'deletionImplemented':False}));return 2
if __name__=='__main__':sys.exit(main())
