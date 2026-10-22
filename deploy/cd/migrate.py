#!/usr/bin/env python3
"""One official Prisma deployment in a separate systemd credential sandbox.
Never prints credentials, SQL output or business values. No retry or SQL rollback.
"""
import configparser,hashlib,json,os,re,subprocess,sys,time,urllib.parse
from pathlib import Path

HOST='traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com'
SCHEMA='traceflow_live'
UUID='6e94bb7f-c601-11f1-9b91-02001704771f'
CA='/etc/pki/traceflow/mysql-ca.pem'
RELEASES=Path('/opt/traceflow-live/releases')

def need(v,c):
    if not v:raise ValueError(c)

def execute(root):
    need(os.geteuid()==0,'ROOT_REQUIRED')
    root=Path(root)
    need(root.parent==RELEASES and root.is_dir() and not root.is_symlink(),'MIGRATION_RELEASE')
    credential=Path(os.environ['CREDENTIALS_DIRECTORY'])/'mysql-migrator'
    need(credential.is_file() and not credential.is_symlink() and credential.stat().st_uid==0 and not credential.stat().st_mode&0o077,'MIGRATOR_CUSTODY')
    parser=configparser.ConfigParser(interpolation=None);parser.read(credential)
    user=parser['client']['user'];password=parser['client']['password']
    need(user=='tf_live_migrator' and password,'MIGRATOR_IDENTITY')
    query="SELECT JSON_ARRAY(@@server_uuid,DATABASE(),CURRENT_USER()); SHOW STATUS LIKE 'Ssl_cipher';"
    p=subprocess.run(['/usr/bin/mysql','--defaults-file='+str(credential),'--no-login-paths','--protocol=TCP','--host='+HOST,'--ssl-mode=VERIFY_IDENTITY','--ssl-ca='+CA,'--tls-version=TLSv1.2,TLSv1.3','--batch','--raw','--skip-column-names','--local-infile=0','--skip-reconnect','--connect-timeout=5',SCHEMA],input=query.encode(),capture_output=True,timeout=15)
    need(p.returncode==0,'MIGRATOR_TLS_CONNECTION')
    rows=p.stdout.decode().splitlines();need(json.loads(rows[0])==[UUID,SCHEMA,'tf_live_migrator@10.20.1.184'] and len(rows)==2 and rows[1].startswith('Ssl_cipher\t') and rows[1].split('\t')[1],'MIGRATOR_DATABASE_IDENTITY')
    cli=root/'backend/node_modules/prisma/build/index.js'
    need(cli.is_file() and json.loads((root/'backend/node_modules/prisma/package.json').read_text())['version']=='6.12.0','PRISMA_CLI_IDENTITY')
    url=urllib.parse.urlunsplit(('mysql',urllib.parse.quote(user,safe='')+':'+urllib.parse.quote(password,safe='')+'@'+HOST+':3306','/'+SCHEMA,urllib.parse.urlencode({'connection_limit':2,'pool_timeout':5,'sslaccept':'strict','sslcert':CA}),''))
    env={k:v for k,v in os.environ.items() if k not in ('DIRECT_URL','SHADOW_DATABASE_URL','PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK')}
    env.update(DATABASE_URL=url,NODE_ENV='production',HOME='/nonexistent')
    started=time.monotonic()
    p=subprocess.run(['/usr/bin/node',str(cli),'migrate','deploy','--schema',str(root/'backend/prisma/schema.prisma')],cwd=root/'backend',env=env,capture_output=True,timeout=260)
    # Raw Prisma output is deliberately not written to logs or receipts.
    codes=re.findall(rb'\bP[0-9]{4}\b',p.stderr+p.stdout)
    print(json.dumps({'status':'PRISMA_DEPLOY_PASS' if p.returncode==0 else 'PRISMA_DEPLOY_FAILED','exitCode':p.returncode,'seconds':round(time.monotonic()-started,3),'prismaCode':codes[0].decode() if codes else None,'outputSha256':hashlib.sha256(p.stdout+p.stderr).hexdigest()}))
    need(p.returncode==0,'PRISMA_DEPLOY_FAILED_NO_RETRY')

if __name__=='__main__':
    try:execute(sys.argv[1])
    except BaseException as e:
        print(json.dumps({'status':'BLOCKED','code':str(e) if re.fullmatch('[A-Z][A-Z0-9_]{0,90}',str(e)) else 'MIGRATION_EXECUTION_FAILED','automaticRetry':False}));sys.exit(1)
