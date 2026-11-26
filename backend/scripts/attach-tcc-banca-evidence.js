/** Anexa uma evidência PNG sintética ao fixture já existente, sem recriar execução.
 * node backend/scripts/attach-tcc-banca-evidence.js [--apply]
 * Configuração somente em backend/.env local. Padrão: dry-run.
 */
import dotenv from 'dotenv';
import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
dotenv.config({ quiet: true });
process.env.NODE_ENV ||= 'development';
let target;
try {
  target = new URL(process.env.DATABASE_URL);
} catch {
  throw Error('Configuração local inválida.');
}
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/traceflow' ||
  (target.port || '3306') !== '3306' ||
  process.env.NODE_ENV !== 'development'
)
  throw Error('Exige MySQL local de desenvolvimento.');
const { prisma, disconnectDatabase } = await import('../src/database/prismaClient.js');
const { testEvidenceStorage: storage } =
  await import('../src/modules/testCases/storage/local-test-evidence.storage.js');
const { buildAuditEvent } = await import('../src/modules/audit/audit.service.js');
const base = resolve('../build/tcc-banca-2026-final');
const name = 'pg-2026-0042-captura-duplicada-SINTETICA.png';
const assert = (v, m) => {
  if (!v) throw Error(m);
};
let lock,
  attempt,
  committed = false;
try {
  const owner = await prisma.user.findUnique({
    where: { username: 'daniel.musse' },
    select: { id: true }
  });
  const project = await prisma.project.findUnique({
    where: { id: 221 },
    include: { memberships: true }
  });
  assert(
    project?.description.endsWith('[dataset:traceflow:tcc-banca-2026:v2:pagamentos]') &&
      project.memberships.some((m) => m.userId === owner?.id && m.role === 'OWNER' && m.isActive),
    'Fixture/OWNER divergente.'
  );
  const execution = await prisma.testExecution.findUnique({
    where: { id: 57 },
    include: { steps: { orderBy: { position: 'asc' } } }
  });
  assert(
    execution.projectId === 221 &&
      execution.testCaseId === 41 &&
      execution.testCaseVersion === 1 &&
      execution.result === 'FAIL' &&
      execution.steps.map((s) => s.result).join(',') === 'PASS,FAIL' &&
      execution.steps[1].id === 90,
    'Execução divergente.'
  );
  const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const executionFingerprint = fingerprint(execution);
  const bytes = await readFile(resolve(base, 'evidencias', name));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const existing = await prisma.testEvidence.findMany({
    where: { projectId: 221, executionId: 57, originalName: name }
  });
  assert(existing.length <= 1, 'Evidência duplicada; revisão necessária.');
  if (existing.length) {
    const file = existing[0];
    assert(
      file.sha256 === sha256 && file.mimeType === 'image/png' && file.scope === 'EXECUTION',
      'Conteúdo da evidência divergiu.'
    );
    const stream = await storage.content(file.storageKey, file.sizeBytes);
    const hash = createHash('sha256');
    for await (const part of stream) hash.update(part);
    assert(hash.digest('hex') === sha256, 'Storage divergente.');
    console.log(JSON.stringify({ idempotent: true, changed: false, evidenceId: file.id, sha256 }));
  } else if (!process.argv.includes('--apply'))
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        executionId: 57,
        projectId: 221,
        name,
        bytes: bytes.length,
        sha256
      })
    );
  else {
    await mkdir(resolve('.local/tcc-banca-2026-final'), { recursive: true });
    lock = await open(resolve('.local/tcc-banca-2026-final/evidence.lock'), 'wx');
    attempt = await storage.begin();
    await storage.receive(attempt, {
      fieldname: 'evidence',
      originalname: name,
      stream: Readable.from([bytes])
    });
    const [prepared] = await storage.prepare(attempt, [1, 2]);
    const file = { ...prepared };
    delete file.position;
    const saved = await prisma.$transaction(async (tx) => {
      const current = await tx.testExecution.findUnique({
        where: { id: 57 },
        include: { steps: { orderBy: { position: 'asc' } } }
      });
      assert(fingerprint(current) === executionFingerprint, 'Execução alterada durante o anexo.');
      const evidence = await tx.testEvidence.create({
        data: {
          ...file,
          projectId: 221,
          executionId: 57,
          executionStepId: null,
          uploadedByUserId: owner.id
        }
      });
      const audit = await tx.auditEvent.create({
        data: buildAuditEvent({
          actorUserId: owner.id,
          projectId: 221,
          action: 'TCC_SYNTHETIC_EVIDENCE_ATTACHED',
          resourceType: 'TestEvidence',
          resourceId: evidence.id,
          reasonCode: 'TCC_BANCA_2026_FINAL',
          requestId: 'tcc-final-exec-57-image',
          metadata: { source: 'SYNTHETIC_EXECUTION_EVIDENCE', count: 1, version: 1 }
        })
      });
      return { evidenceId: evidence.id, auditId: audit.id };
    });
    committed = true;
    await storage.cleanup(attempt, { committed: true });
    attempt = null;
    const after = await prisma.testExecution.findUnique({
      where: { id: 57 },
      include: { steps: { orderBy: { position: 'asc' } } }
    });
    assert(fingerprint(after) === executionFingerprint, 'Histórico da execução divergente.');
    const proof = {
      ...saved,
      projectId: 221,
      testCaseId: 41,
      executionId: 57,
      originalName: name,
      sha256,
      sizeBytes: bytes.length,
      executionFingerprint,
      executionUnchanged: true,
      synthetic: true,
      result: 'FAIL',
      steps: ['PASS', 'FAIL'],
      createdAt: new Date().toISOString()
    };
    await writeFile(
      resolve(base, 'evidencias/ANEXO-PERSISTIDO.json'),
      JSON.stringify(proof, null, 2)
    );
    await writeFile(
      resolve('.local/tcc-banca-2026-final/anexo.json'),
      JSON.stringify(proof, null, 2),
      { mode: 0o600 }
    );
    console.log(JSON.stringify({ changed: true, ...saved, executionUnchanged: true }));
  }
} catch (e) {
  console.error(e.message.slice(0, 400));
  process.exitCode = 1;
} finally {
  if (attempt) await storage.cleanup(attempt, { committed });
  if (lock) {
    await lock.close();
    await unlink(resolve('.local/tcc-banca-2026-final/evidence.lock'));
  }
  await disconnectDatabase();
}
