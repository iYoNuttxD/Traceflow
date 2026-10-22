import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('monitor',Path(__file__).resolve().parents[1]/'scripts/persistence-monitor.py')
monitor=importlib.util.module_from_spec(spec);spec.loader.exec_module(monitor)
class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.policy=dict(maxBackupAgeSeconds=86400,maxRestoreAgeSeconds=86400*7,maxSensorAgeSeconds=120,minFreeBytes=512*1024**2,certificateWarningDays=30,minimumCopies=3,retentionSeconds=86400*7,approved=False)
        self.sensors=dict(checkedAtEpoch=100000,readiness=True,liveness=True,workerHeartbeatFresh=True,freeBytes=1024**3,certificateRemainingDays=60,poolBudgetExceeded=False,maintenanceReviewRequired=False)
    def test_absence_is_not_health(self):
        r=monitor.evaluate(self.policy,[],None,None,100000)
        self.assertEqual(r['status'],'ALERT');self.assertIn('NO_COMPLETE_BACKUP',r['alerts']);self.assertIn('RESTORE_NOT_REHEARSED',r['alerts'])
    def test_invalid_copy_and_stale_sensors(self):
        r=monitor.evaluate(self.policy,[{'valid':False}],None,dict(self.sensors,checkedAtEpoch=1),100000)
        self.assertIn('BACKUP_INVALID',r['alerts']);self.assertIn('SENSORS_MISSING_OR_STALE',r['alerts'])
    def test_unapproved_policy_never_proposes_deletion(self):
        copies=[dict(valid=True,backupId=str(i),createdAt=i,manifestSha256=str(i),pinned=False) for i in range(5)]
        receipt=dict(status='RESTORED_INTEGRITY_VALIDATED',applicationSmoke='PASS',backupId='0',manifestSha256='0',finishedAtUtc='1970-01-01T00:00:01+00:00')
        r=monitor.evaluate(self.policy,copies,receipt,self.sensors,1000000)
        self.assertEqual(r['retentionCandidates'],[]);self.assertFalse(r['deletionImplemented'])
        self.policy['approved']=True;r=monitor.evaluate(self.policy,copies,receipt,self.sensors,1000000)
        self.assertEqual(r['retentionCandidates'],['1'])
    def test_future_backup_and_mismatched_restore_receipt(self):
        copies=[dict(valid=True,backupId='a',createdAt=100100,manifestSha256='digest',pinned=False)]
        r=monitor.evaluate(self.policy,copies,None,self.sensors,100000)
        self.assertIn('BACKUP_INVALID',r['alerts']);self.assertIn('NO_COMPLETE_BACKUP',r['alerts'])
        copies[0]['createdAt']=99999
        receipt=dict(status='RESTORED_INTEGRITY_VALIDATED',applicationSmoke='PASS',backupId='other',manifestSha256='digest')
        r=monitor.evaluate(self.policy,copies,receipt,self.sensors,100000)
        self.assertIn('RESTORE_NOT_REHEARSED',r['alerts'])
    def test_independent_operational_alerts(self):
        sensors=dict(self.sensors,readiness=False,liveness=False,workerHeartbeatFresh=False,freeBytes=0,certificateRemainingDays=1,poolBudgetExceeded=True,maintenanceReviewRequired=True)
        r=monitor.evaluate(self.policy,[],None,sensors,100000)
        for code in ['MYSQL_OR_STORAGE_NOT_READY','API_NOT_LIVE','WORKER_HEARTBEAT_MISSING','DISK_LOW','CERTIFICATE_EXPIRING','POOL_BUDGET_UNVERIFIED_OR_EXCEEDED','MAINTENANCE_REVIEW_REQUIRED']:self.assertIn(code,r['alerts'])
if __name__=='__main__':unittest.main()
