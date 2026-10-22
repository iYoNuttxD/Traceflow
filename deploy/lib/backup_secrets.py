"""OCI Secret Management fetch. Secret bytes remain in RAM or root-only /run.
No provisioning, IAM changes, metadata bypass, or fallback provider is implemented.
"""
import base64,hashlib,os,re,stat
from pathlib import Path
from activation_contract import exact
from operational_io import tool,unique,secure_read,private_write
from release_contract import fsync_dir
from release_contract import require
SECRET_QUERY='data.{secretId:"secret-id",version:"version-number",content:"secret-bundle-content".content,contentType:"secret-bundle-content"."content-type"}'
def validate_reference(ref):
 exact(ref,{'provider','secretId','versionNumber','identity'},'SECRET_REFERENCE_FIELDS')
 require(ref['provider']=='oci-secret-api-key' and isinstance(ref['secretId'],str) and
         re.fullmatch(r'ocid1\.vaultsecret\.oc1\.sa-saopaulo-1\.[a-z0-9]{20,120}',ref['secretId']) and
         type(ref['versionNumber']) is int and ref['versionNumber']>0,'SECRET_REFERENCE')

 exact(ref['identity'],{'userId','tenancyId','fingerprint'},'SECRET_IDENTITY_FIELDS')
 for field,kind in (('userId','user'),('tenancyId','tenancy')):
  require(isinstance(ref['identity'][field],str) and
          re.fullmatch(r'ocid1\.'+kind+r'\.oc1\.\.[a-z0-9]{20,120}',ref['identity'][field]),'SECRET_IDENTITY')
 require(isinstance(ref['identity']['fingerprint'],str) and re.fullmatch(r'(?:[a-f0-9]{2}:){15}[a-f0-9]{2}',ref['identity']['fingerprint']),'SECRET_FINGERPRINT')

def decode_bundle(raw,ref):
 validate_reference(ref);bundle=unique(raw)
 exact(bundle,{'secretId','version','content','contentType'},'SECRET_BUNDLE_FIELDS')
 require(bundle['secretId']==ref['secretId'] and type(bundle['version']) is int and
         bundle['version']==ref['versionNumber'] and bundle['contentType']=='BASE64','SECRET_VERSION_MISMATCH')
 require(isinstance(bundle['content'],str) and 0<len(bundle['content'])<=8192,'SECRET_CONTENT_SIZE')
 try:decoded=base64.b64decode(bundle['content'],validate=True)
 except (ValueError,TypeError):require(False,'SECRET_ENCODING')
 value=unique(decoded);exact(value,{'formatVersion','user','password'},'SECRET_CONTENT_FIELDS')
 require(type(value['formatVersion']) is int and value['formatVersion']==1 and value['user']=='traceflow_admin','SECRET_ACCOUNT')
 password=value['password'];require(isinstance(password,str) and 0<len(password.encode())<=1024 and
   not any(ord(c)<32 or ord(c)==127 for c in password),'SECRET_PASSWORD_FORMAT')
 return ('[client]\nuser=traceflow_admin\npassword="'+password.replace('\\','\\\\').replace('"','\\"')+'"\n').encode()

# Only systemd-decrypted credentials from the reviewed units are accepted.
# No instance-principal fallback: that identity is shared by all VM users.
CREDENTIAL_DIRECTORIES={
 '/run/credentials/traceflow-recovery-backup.service',
 '/run/credentials/traceflow-recovery-reconcile.service',
 '/run/credentials/traceflow-recovery-supervised.service',
}
CLIENT_DIRECTORY=Path('/run/traceflow-secret-client')

def signing_key(ref):
 directory=os.environ.get('CREDENTIALS_DIRECTORY')
 require(directory in CREDENTIAL_DIRECTORIES,'SECRET_SYSTEMD_CREDENTIAL_REQUIRED')
 path=Path(directory)/'oci-api-key'
 secure_read(path,0,16384,0o400)
 public=tool(['/usr/bin/openssl','pkey','-in',str(path),'-pubout','-outform','DER'],timeout=5,maximum=2048)
 fp=hashlib.md5(public,usedforsecurity=False).hexdigest()
 require(':'.join(fp[i:i+2] for i in range(0,32,2))==ref['identity']['fingerprint'],'SECRET_SIGNING_KEY_CHANGED')
 return path

def fetch(policy,backup_policy):
 ref=policy['credential'];validate_reference(ref);key=signing_key(ref)
 # This private, ephemeral config contains only identity metadata + key path.
 parent=CLIENT_DIRECTORY;parent.mkdir(mode=0o700,exist_ok=True)
 require(not parent.is_symlink() and parent.stat().st_uid==0 and stat.S_IMODE(parent.stat().st_mode)==0o700,'SECRET_CLIENT_DIRECTORY')
 for a in parent.parents:
  require(not a.is_symlink() and a.is_dir() and a.stat().st_uid==0 and not a.stat().st_mode&0o022,'SECRET_CLIENT_ANCESTOR')
 config=parent/'config';identity=ref['identity']
 data=('[DEFAULT]\nuser='+identity['userId']+'\ntenancy='+identity['tenancyId']+'\nfingerprint='+identity['fingerprint']+
       '\nregion=sa-saopaulo-1\nkey_file='+str(key)+'\n').encode()
 # A killed client may leave only this non-secret metadata file. Reuse is
 # allowed only after exact identity/path comparison under the operation lock.
 if config.exists():
  require(secure_read(config,0,4096,0o600)==data,'SECRET_CLIENT_CONFIG_CHANGED')
 else:private_write(config,data);fsync_dir(parent)
 try:
  raw=tool([backup_policy['oci'],'--auth','api_key','--config-file',str(config),'--profile','DEFAULT',
   '--region','sa-saopaulo-1','--no-retry','--connection-timeout','5','--read-timeout','15',
   'secrets','secret-bundle','get','--secret-id',ref['secretId'],'--version-number',str(ref['versionNumber']),
   '--query',SECRET_QUERY],timeout=25,maximum=16384)
  return decode_bundle(raw,ref)
 finally:
  require(secure_read(config,0,4096,0o600)==data,'SECRET_CLIENT_CONFIG_CHANGED')
  config.unlink();fsync_dir(parent)
