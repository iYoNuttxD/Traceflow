"""No deletion API. Retention is a review plan; capacity exhaustion stops new uploads."""
import datetime as dt
import re
from activation_contract import exact, sha, utc
from release_contract import require
BUCKET='traceflow-production-recovery'
NAMESPACE='grcxenfrp09f'
REGION='sa-saopaulo-1'
MAX_SET=512*1024**2
MAX_TOTAL=8*1024**3
MAX_REQUESTS=1000

def validate_policy(p):
    exact(p,{'formatVersion','bucket','namespace','region','maxBytes','maxRequestsPerMonth','maxSets',
             'retentionDays','dailyIntervalHours','recipient','recipientSha256','age','ageSha256','oci','ociSha256',
             'custodian','operationallyAuthorized'},'BACKUP_POLICY_FIELDS')
    require(p['formatVersion']==1 and p['bucket']==BUCKET and p['namespace']==NAMESPACE and p['region']==REGION,'BACKUP_DESTINATION')
    require(p['maxBytes']==MAX_TOTAL and p['maxRequestsPerMonth']==MAX_REQUESTS and p['maxSets']==16 and
            p['retentionDays']==14 and p['dailyIntervalHours']==24,'BACKUP_LIMIT_POLICY')
    require(p['operationallyAuthorized'] is True and isinstance(p['custodian'],str) and 3<=len(p['custodian'])<=80,'BACKUP_OPERATIONAL_AUTHORIZATION')
    require(isinstance(p['recipient'],str) and re.fullmatch(r'age1[023456789acdefghjklmnpqrstuvwxyz]{58}',p['recipient']), 'AGE_RECIPIENT')
    from release_contract import digest
    require(digest(p['recipient'].encode())==sha(p['recipientSha256']),'CUSTODY_RECIPIENT')
    for name in ('age','oci'):
        require(isinstance(p[name],str) and p[name].startswith('/') and not any(c.isspace() for c in p[name]),'BACKUP_TOOL_PATH')
        sha(p[name+'Sha256'])

def budget(objects,new_bytes,requests_used,run_id):
    require(isinstance(objects,dict) and set(objects)<= {'data','prefixes','next-start-with'} and
            objects.get('prefixes')==[] and not objects.get('next-start-with'),'BUCKET_INVENTORY_INCOMPLETE')
    rows=objects.get('data');require(isinstance(rows,list) and len(rows)<=32,'BUCKET_INVENTORY_LIMIT')
    names=set();sets=set();total=0
    for row in rows:
        require(isinstance(row,dict) and isinstance(row.get('name'),str) and type(row.get('size')) is int and row['size']>0,'OBJECT_RECORD')
        match=re.fullmatch(r'backups/([a-f0-9]{32})/(payload\.age|manifest\.json\.age)',row['name'])
        require(match and row['name'] not in names and match[1]!=run_id,'OBJECT_INVENTORY_UNEXPECTED')
        names.add(row['name']);sets.add(match[1]);total+=row['size']
        require(row['size']<=MAX_SET,'OBJECT_SIZE')
    require(type(new_bytes) is int and 0<new_bytes<=MAX_SET and total+new_bytes<=MAX_TOTAL,'BACKUP_STORAGE_BUDGET')
    require(len(sets)<16,'RETENTION_REVIEW_REQUIRED')
    require(type(requests_used) is int and 0<=requests_used<=MAX_REQUESTS-32,'BACKUP_REQUEST_BUDGET')
    return {'existingBytes':total,'plannedBytes':total+new_bytes,'existingSets':len(sets),'reservedRequests':32}

def retention(catalog,now):
    require(isinstance(catalog,list),'BACKUP_CATALOG')
    review=[]
    for r in catalog:
        require(isinstance(r,dict) and re.fullmatch(r'[a-f0-9]{32}',r.get('backupId','')),'BACKUP_CATALOG_RECORD')
        if now-utc(r['createdAt'])>14*86400 and not r.get('preActivation'):
            review.append(r['backupId'])
    return {'delete':False,'reviewOnly':review,'preActivationPreserved':True}
