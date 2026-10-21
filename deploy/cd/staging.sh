#!/usr/bin/env bash
set -euo pipefail
# This schema and storage exist only in the disposable GitHub-hosted job.
[[ "$DATABASE_URL" == mysql://ci:synthetic@127.0.0.1:3306/traceflow_cd_test ]]
export NODE_ENV=test TEST_DATABASE_URL="$DATABASE_URL" HTTP_HOST=127.0.0.1 PORT=3001
export TEST_EVIDENCE_STORAGE_DIR=/tmp/traceflow-cd-isolated
mkdir -m 700 "$TEST_EVIDENCE_STORAGE_DIR"
npx prisma migrate deploy
# A new empty isolated schema has no integration/project, therefore no external work.
# The worker still needs a complete synthetic App configuration to register heartbeat.
export GITHUB_APP_ID=1 GITHUB_APP_CLIENT_ID=isolated-ci GITHUB_APP_CLIENT_SECRET=synthetic-ci
export GITHUB_APP_SLUG=traceflow-isolated-ci GITHUB_APP_WEBHOOK_SECRET=synthetic-ci
export GITHUB_APP_CALLBACK_URL=http://localhost:3001/api/github-app/callback
export GITHUB_APP_FRONTEND_SUCCESS_URL=http://localhost:5173/ci-success
export GITHUB_APP_FRONTEND_ERROR_URL=http://localhost:5173/ci-error
export GITHUB_APP_PRIVATE_KEY_BASE64="$(node --input-type=module -e 'import {generateKeyPairSync} from "node:crypto";const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});process.stdout.write(Buffer.from(privateKey.export({type:"pkcs8",format:"pem"})).toString("base64"))')"
node src/server.js >/tmp/traceflow-cd-api.log 2>&1 & api=$!
GITHUB_SCHEDULER_ENABLED=true node src/github-worker.js >/tmp/traceflow-cd-worker.log 2>&1 & worker=$!
cleanup() { kill -TERM "$api" "$worker" 2>/dev/null || true; wait "$api" "$worker" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
ready=0
for attempt in $(seq 1 30); do
 if curl --fail --silent --max-time 2 http://127.0.0.1:3001/health/ready -o /tmp/readiness.json; then ready=1; break; fi
 sleep 1
done
test "$ready" = 1
node --input-type=module -e 'import fs from "node:fs"; if(JSON.parse(fs.readFileSync("/tmp/readiness.json")).status!=="ready")process.exit(1)'
test "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3001/api/auth/me)" = 401
kill -0 "$api" "$worker"
node --input-type=module -e 'import {PrismaClient} from "@prisma/client";const p=new PrismaClient();try{const m=await p.$queryRawUnsafe("SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL");if(Number(m[0].n)!==68)throw new Error("MIGRATION_COUNT");let w=0;const deadline=Date.now()+15000;while(Date.now()<deadline){w=await p.gitHubSchedulerWorker.count({where:{heartbeatAt:{gte:new Date(Date.now()-30000)}}});if(w>=1)break;await new Promise(r=>setTimeout(r,500));}if(w<1)throw new Error("WORKER_HEARTBEAT");console.log(JSON.stringify({status:"ISOLATED_SCHEMA_API_WORKER_PASS",migrations:68,productionSecretsUsed:false,productionDatabaseUsed:false}));}finally{await p.$disconnect();}'
