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
 npm --prefix backend run lint
 npm --prefix frontend run lint
 npm --prefix backend run security:secrets
 (cd backend && npx prisma validate && npx prisma generate)
 (cd backend && npx vitest run test/unit/production-environment.test.js test/unit/production-lifecycle.test.js test/unit/health-shutdown.test.js)
 (cd backend && bash "$OPS_ROOT/deploy/cd/staging.sh")
 npm --prefix backend audit --omit=dev --audit-level=high
 npm --prefix frontend audit --omit=dev --audit-level=high
else
 (cd backend && npx prisma generate)
fi
npm --prefix frontend run build
git diff --exit-code
test -z "$(git ls-files --others --exclude-standard backend/src backend/prisma frontend/src)"
mkdir -p "/out/root-$PASS/backend" "/out/root-$PASS/frontend"
cp -a backend/src backend/prisma backend/node_modules backend/package.json backend/package-lock.json "/out/root-$PASS/backend/"
cp -a frontend/dist/. "/out/root-$PASS/frontend/"
# Prune only the disposable package copy; npm may normalize generated lock metadata.
npm --prefix "/out/root-$PASS/backend" prune --omit=dev --no-audit --no-fund
git diff --exit-code
python3 "$OPS_ROOT/deploy/cd/package.py" "/out/root-$PASS" "/out/release-$PASS.tar.gz" --commit "$APP_SHA" --epoch "$SOURCE_DATE_EPOCH" > "/out/identity-$PASS.json"
