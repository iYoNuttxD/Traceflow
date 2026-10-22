#!/usr/bin/env bash
set -euo pipefail
# Executed only in the pinned-for-this-run Oracle Linux ARM64 container.
: "${APP_SHA:?}" "${SOURCE_DATE_EPOCH:?}" "${PASS:?}" "${OPS_ROOT:?}" "${SOURCE_ROOT:?}"
test "$(uname -m)" = aarch64
grep -q 'release 9.8' /etc/oracle-release
test "$(node --version)" = v22.23.2
cd "$SOURCE_ROOT"
test "$(git rev-parse HEAD)" = "$APP_SHA"
git diff --exit-code
git diff --cached --exit-code
export NODE_ENV=development DATABASE_URL=mysql://ci:synthetic@127.0.0.1:3306/traceflow_cd_test
export TEST_DATABASE_URL="$DATABASE_URL" VITE_API_URL=/api
npm --prefix backend ci --no-audit --no-fund
npm --prefix frontend ci --no-audit --no-fund
if [ "$PASS" = 1 ]; then
 python3 -B -m unittest discover -s "$OPS_ROOT/deploy/cd/tests" -v
 python3 -B -m unittest discover -s "$OPS_ROOT/deploy/tests/operations" -v
 node --test "$OPS_ROOT/deploy/tests/operations/retention.test.mjs"
 npm --prefix backend run lint
 npm --prefix frontend run lint
 npm --prefix backend run security:secrets
 (cd backend && npx prisma validate && npx prisma generate)
 (cd backend && npx vitest run test/unit/production-environment.test.js test/unit/production-lifecycle.test.js test/unit/health-shutdown.test.js)
 if [ -f backend/scripts/validate-integration-upgrade.js ]; then
  (cd backend && node --input-type=module -e 'import {PrismaClient} from "@prisma/client";const p=new PrismaClient({datasourceUrl:"mysql://root:synthetic-root-ci@127.0.0.1:3306/traceflow_cd_test"});try{const existing=await p.$queryRawUnsafe("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?","traceflow_cd_upgrade_test");if(existing.length)throw Error("UPGRADE_TARGET_EXISTS");await p.$executeRawUnsafe("CREATE DATABASE traceflow_cd_upgrade_test");}finally{await p.$disconnect();}')
  (cd backend && NODE_ENV=test DATABASE_URL=mysql://root:synthetic-root-ci@127.0.0.1:3306/traceflow_dev_unused TEST_DATABASE_URL=mysql://root:synthetic-root-ci@127.0.0.1:3306/traceflow_cd_upgrade_test node scripts/validate-integration-upgrade.js b9c1beb9f6ded49ce9257d346c086a8893f700c9) | tee /out/upgrade-proof.json
 fi
 (cd backend && bash "$OPS_ROOT/deploy/cd/staging.sh")
 npm --prefix backend audit --omit=dev --audit-level=high
 npm --prefix frontend audit --omit=dev --audit-level=high
else
 (cd backend && npx prisma generate)
fi
NODE_ENV=production npm --prefix frontend run build
git diff --exit-code
test -z "$(git ls-files --others --exclude-standard backend/src backend/prisma frontend/src)"
mkdir -p "/package/backend" "/package/frontend"
cp -a backend/src backend/prisma backend/node_modules backend/package.json backend/package-lock.json "/package/backend/"
cp -a frontend/dist/. "/package/frontend/"
# Prune only the disposable package copy; npm may normalize generated lock metadata.
npm --prefix "/package/backend" prune --omit=dev --no-audit --no-fund
# Runtime must not include the first build's transient Vitest timing/results cache.
python3 - <<'PYCACHE'
import shutil
from pathlib import Path
cache=Path('/package/backend/node_modules/.vite')
if cache.exists():
 assert cache.is_dir() and not cache.is_symlink()
 shutil.rmtree(cache)
PYCACHE
git diff --exit-code
python3 "$OPS_ROOT/deploy/cd/package.py" "/package" "/out/release-$PASS.tar.gz" --commit "$APP_SHA" --epoch "$SOURCE_DATE_EPOCH" > "/out/identity-$PASS.json"
