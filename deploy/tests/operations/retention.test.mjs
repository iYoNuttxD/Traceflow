import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRetention, assertScopedTarget } from '../../operations/live_retention.mjs';
test('only the live schema, account and storage are eligible', () => {
 const env = {DATABASE_URL:'mysql://tf_live_api@traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com:3306/traceflow_live',TEST_EVIDENCE_STORAGE_DIR:'/var/lib/traceflow-live/test-evidence'};
 assert.doesNotThrow(() => assertScopedTarget(env));
 for (const url of ['mysql://tf_live_api@127.0.0.1/traceflow_live','mysql://tf_live_api@traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com/traceflow']) assert.throws(() => assertScopedTarget({...env,DATABASE_URL:url}));
 assert.throws(() => assertScopedTarget({...env,TEST_EVIDENCE_STORAGE_DIR:'/var/lib/traceflow/test-evidence'}));
});
test('sequential official contracts, exact mode and no identifiers in summary', async () => {
 for (const apply of [false,true]) {
  const called=[];
  const fn = name => async options => {called.push([name,options]); return {count:0,projectIds:['not-exported'],message:'not-exported',failed:0};};
  const result = await executeRetention({auth:fn('auth'),privacy:fn('privacy'),projects:fn('projects'),uploads:fn('uploads')},apply);
  assert.deepEqual(called,[['auth',{apply}],['privacy',{apply}],['projects',{dryRun:!apply}],['uploads',{dryRun:!apply}]]);
  assert.deepEqual(result.projects,{count:0,failed:0});
 }
});
test('partial failure cannot be reported as successful', async () => {
 const ok=async()=>({count:0});
 await assert.rejects(executeRetention({auth:ok,privacy:ok,projects:async()=>({failed:1}),uploads:ok},true),/RETENTION_INCOMPLETE/);
});
test('retention follows the root-selected release and limits its own pool', async () => {
 const { releaseRoot, commandDatabaseUrl } = await import('../../operations/live_retention.mjs');
 const root='/opt/traceflow-live/releases/'+'a'.repeat(40)+'-'+'b'.repeat(12)+'/backend';
 const inspect=()=>({isDirectory:()=>true,isSymbolicLink:()=>false,uid:0,mode:0o755});
 assert.equal(releaseRoot(root,{inspect,realpath:p=>p}),root+'/');
 assert.throws(()=>releaseRoot('/tmp/candidate',{inspect,realpath:p=>p}));
 assert.throws(()=>releaseRoot(root,{inspect:()=>({...inspect(),uid:985}),realpath:p=>p}));
 assert.throws(()=>releaseRoot(root,{inspect,realpath:()=>'/other'}));
 const url=new URL(commandDatabaseUrl('mysql://synthetic@localhost/test?connection_limit=5&sslaccept=strict'));
 assert.equal(url.searchParams.get('connection_limit'),'2');assert.equal(url.searchParams.get('sslaccept'),'strict');
});
