// Real CLI execution; all GitHub responses and keys are SYNTHETIC. No production receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, createHmac, createHash } from 'node:crypto';
import { provePayload } from '../../scripts/oci/hmac-proof.mjs';
import { parseGithubJson } from '../../backend/src/modules/github/github-json.js';
const large='3849085576043036672';
const root=resolve(import.meta.dirname,'../..');
test('HMAC preserves unsafe numeric tokens and rejects changed payloads',()=>{
 const raw=`{"id":${large},"installation":{"id":9007199254740993}}`;
 const signature='sha256='+createHmac('sha256','SYNTHETIC_ONLY').update(raw).digest('hex');
 assert.equal(provePayload(parseGithubJson(raw,{rawIntegers:true}),signature,'SYNTHETIC_ONLY').payloadSha256,createHash('sha256').update(raw).digest('hex'));
 assert.throws(()=>provePayload(JSON.parse(raw),signature,'SYNTHETIC_ONLY'));
});
test('CLI runs list, verify and failure paths with exact large delivery IDs',()=>{
 const dir=mkdtempSync(join(tmpdir(),'traceflow-0722-cli-'));
 try {
 const raw=`{"id":${large}}`,secret='SYNTHETIC_ONLY';
 const delivery={id:large,guid:'synthetic-delivery',delivered_at:'2030-01-01T00:00:01Z',status_code:202,url:'https://traceflow.dev/api/webhooks/github-app',event:'installation',request:{headers:{'X-GitHub-Delivery':'synthetic-delivery','X-Hub-Signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')},payload:JSON.parse(raw)}};
 const wire=JSON.stringify(delivery).replace(`"id":"${large}"`,`"id":${large}`).replace(`"payload":${JSON.stringify(JSON.parse(raw))}`,`"payload":${raw}`);
 const fixtures={'/app':JSON.stringify({id:1,slug:'synthetic'}),'/app/hook/config':JSON.stringify({insecure_ssl:'0',url:delivery.url}),'/app/hook/deliveries?per_page=20':`[{"id":${large}}]`,'/app/installations?per_page=100':'[]',['/app/hook/deliveries/'+large]:wire};
 const preload=join(dir,'mock.mjs');writeFileSync(preload,`const data=${JSON.stringify(fixtures)};globalThis.fetch=async(url)=>{const u=new URL(url);if(u.origin!=='https://api.github.com'||!Object.hasOwn(data,u.pathname+u.search))throw new Error('SYNTHETIC_UNEXPECTED_NETWORK');return new Response(data[u.pathname+u.search],{status:200});};`);
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const env={PATH:process.env.PATH,GITHUB_APP_ID:'1',GITHUB_APP_SLUG:'synthetic',GITHUB_APP_PRIVATE_KEY_BASE64:Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'),GITHUB_APP_WEBHOOK_SECRET:secret};
 const invoke=(...args)=>spawnSync(process.execPath,['--import',preload,join(root,'scripts/oci/github-delivery.mjs'),...args],{env,encoding:'utf8',timeout:10000});
 let result=invoke('list');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).deliveries[0].id,large);
 result=invoke('verify',large,'2030-01-01T00:00:00Z');assert.equal(result.status,0,result.stdout);assert.equal(JSON.parse(result.stdout).payloadSha256,createHash('sha256').update(raw).digest('hex'));
 result=invoke('verify',large,'2030-01-01T00:00:02Z');assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).code,'DELIVERY_NOT_SUCCESSFUL_IN_WINDOW');
 result=invoke('verify','bad','2030-01-01T00:00:00Z');assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).code,'DELIVERY_ID');
 result=invoke('bad');assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).code,'MODE');
 assert.ok(!result.stdout.includes(secret));
 } finally {rmSync(dir,{recursive:true});}
});
