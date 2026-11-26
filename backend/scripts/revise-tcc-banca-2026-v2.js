/** Retificação administrativa de um texto sintético, sem recriar o dataset.
 * node backend/scripts/revise-tcc-banca-2026-v2.js [--apply]
 * Preserva IDs, resultados, versões, datas e passos de detecção.
 */
import dotenv from 'dotenv';
import { Prisma } from '@prisma/client';
import { readFile, writeFile, rename, mkdir, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
dotenv.config({ quiet: true });
process.env.NODE_ENV ||= 'development';
let u;
try {
  u = new URL(process.env.DATABASE_URL);
} catch {
  throw Error('Configuração local inválida.');
}
if (
  process.env.NODE_ENV !== 'development' ||
  !['localhost', '127.0.0.1'].includes(u.hostname) ||
  u.pathname !== '/traceflow' ||
  (u.port || '3306') !== '3306'
)
  throw Error('Exige MySQL de desenvolvimento local traceflow.');
const { prisma, disconnectDatabase } = await import('../src/database/prismaClient.js');
const { testEvidenceStorage: storage } =
  await import('../src/modules/testCases/storage/local-test-evidence.storage.js');
const { buildAuditEvent } = await import('../src/modules/audit/audit.service.js');
const out = resolve('../build/tcc-banca-2026-v2/evidencias');
const journalPath = resolve('.local/tcc-banca-2026/journal.json');
const correctionPath = resolve('.local/tcc-banca-2026-v2/correcao-qa.json');
const oldText = 'Preparação concluída com dados sintéticos válidos.';
const newText =
  'A primeira confirmação de PG-2026-0042 registrou somente CAP-001, no valor fictício de R$ 149,90. Total após a primeira confirmação: uma captura de R$ 149,90.';
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? String(v) : v)))
    .digest('hex');
const assert = (v, m) => {
  if (!v) throw Error(m);
};
async function inventory(ids) {
  const data = {};
  for (const m of Prisma.dmmf.datamodel.models.filter((m) =>
    m.fields.some((f) => f.name === 'projectId' && f.kind === 'scalar')
  )) {
    const key = m.name[0].toLowerCase() + m.name.slice(1);
    data[m.name] = await prisma[key].findMany({
      where: { projectId: { in: ids } },
      ...(m.fields.some((f) => f.name === 'id') ? { orderBy: { id: 'asc' } } : {})
    });
  }
  for (const [key, where] of Object.entries({
    testCaseVersion: { testCase: { projectId: { in: ids } } },
    testCaseStep: { testCase: { projectId: { in: ids } } },
    testCaseTask: { testCase: { projectId: { in: ids } } },
    testExecutionStep: { execution: { projectId: { in: ids } } },
    defectTask: { defect: { projectId: { in: ids } } }
  }))
    data[key] = await prisma[key].findMany({ where, orderBy: { id: 'asc' } });
  return data;
}
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
    owner?.id === 1 &&
      project.description.endsWith('[dataset:traceflow:tcc-banca-2026:v2:pagamentos]') &&
      project.memberships.some((m) => m.userId === owner.id && m.role === 'OWNER' && m.isActive),
    'Projeto/OWNER inesperado.'
  );
  const execution = await prisma.testExecution.findUnique({
    where: { id: 57 },
    include: { steps: { orderBy: { position: 'asc' } } }
  });
  const defect = await prisma.defect.findUnique({ where: { id: 19 } });
  assert(
    execution.projectId === 221 &&
      execution.testCaseId === 41 &&
      execution.testCaseVersion === 1 &&
      execution.result === 'FAIL' &&
      execution.steps[0].id === 89 &&
      execution.steps[0].result === 'PASS' &&
      execution.steps[1].id === 90 &&
      execution.steps[1].result === 'FAIL' &&
      defect.detectedExecutionStepId === 90,
    'Contexto da execução divergiu.'
  );
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  const ids = journal.scenarios.map((s) => s.projectId);
  if (execution.steps[0].observedResult === newText) {
    const proof = JSON.parse(await readFile(correctionPath, 'utf8'));
    const currentInventory = await inventory(ids);
    const readAudits = currentInventory.AuditEvent.filter(
      (row) =>
        row.id > proof.auditId &&
        row.projectId === 221 &&
        row.actorUserId === owner.id &&
        row.action === 'PROJECT_MEMBERS_VIEWED' &&
        row.resourceType === 'ProjectMembership' &&
        row.resourceId === null &&
        row.occurredAt >= new Date(proof.correctedAt)
    );
    const domainInventory = {
      ...currentInventory,
      AuditEvent: currentInventory.AuditEvent.filter(
        (row) => !readAudits.some((read) => read.id === row.id)
      )
    };
    assert(
      proof.status === 'APPLIED' &&
        proof.after === newText &&
        (hash(currentInventory) === journal.inventoryHash ||
          hash(domainInventory) === proof.afterFingerprint),
      'Comprovação da retificação divergiu.'
    );
    await mkdir(out, { recursive: true });
    await writeFile(
      resolve(out, 'IDEMPOTENCIA-RETIFICACAO.json'),
      JSON.stringify(
        {
          changed: false,
          executionId: 57,
          stepId: 89,
          preservedDomainFingerprint: proof.afterFingerprint,
          additionalMembershipReadAuditIds: readAudits.map((row) => row.id)
        },
        null,
        2
      )
    );
    assert(
      await prisma.testEvidence.findUnique({ where: { id: proof.evidenceId } }),
      'Evidência de retificação ausente.'
    );
    assert(
      await prisma.auditEvent.findUnique({ where: { id: proof.auditId } }),
      'Auditoria de retificação ausente.'
    );
    await mkdir(out, { recursive: true });
    await writeFile(resolve(out, 'CORRECAO-QA.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify({ idempotent: true, executionId: 57, stepId: 89, changed: false }));
  } else {
    assert(
      execution.steps[0].observedResult === oldText,
      'Texto alterado por outra atividade; retificação bloqueada.'
    );
    const beforeHash = hash(await inventory(ids));
    assert(
      beforeHash === journal.inventoryHash,
      'Dataset mudou fora da revisão; retificação bloqueada.'
    );
    const proof = {
      dataset: journal.dataset,
      projectId: 221,
      testCaseId: 41,
      executionId: 57,
      stepId: 89,
      defectId: 19,
      before: oldText,
      after: newText,
      preserved: {
        result: 'FAIL',
        stepResults: ['PASS', 'FAIL'],
        version: 1,
        executedAt: execution.executedAt,
        detectedExecutionStepId: 90
      },
      beforeFingerprint: beforeHash
    };
    if (!process.argv.includes('--apply'))
      console.log(JSON.stringify({ mode: 'dry-run', ...proof }));
    else {
      await mkdir(resolve('.local/tcc-banca-2026-v2'), { recursive: true });
      await mkdir(out, { recursive: true });
      lock = await open(resolve('.local/tcc-banca-2026-v2/correcao.lock'), 'wx');
      await writeFile(correctionPath, JSON.stringify({ ...proof, status: 'PREPARED' }, null, 2), {
        mode: 0o600
      });
      attempt = await storage.begin();
      const text = `RETIFICAÇÃO DE DADO SINTÉTICO — BANCA 2026 V2\nEXEC-0057 / CT-41 / Passo 1.\n\nTexto original: ${oldText}\n\nTexto esclarecido: ${newText}\n\nMotivo: esclarecer a captura já prevista e aprovada no cenário sintético. Não é uma nova execução financeira.\nResultado PASS do passo 1, FAIL do passo 2, resultado geral FAIL, versão, datas e vínculo do DEF-19 permanecem iguais.\n`;
      await storage.receive(attempt, {
        fieldname: 'evidence',
        originalname: 'retificacao-sintetica-passo-1.txt',
        stream: Readable.from([Buffer.from(text)])
      });
      const prepared = await storage.prepare(attempt, [1, 2]);
      const result = await prisma.$transaction(async (tx) => {
        const changed = await tx.testExecutionStep.updateMany({
          where: { id: 89, executionId: 57, result: 'PASS', observedResult: oldText },
          data: { observedResult: newText }
        });
        assert(changed.count === 1, 'Conflito de retificação.');
        const file = { ...prepared[0] };
        delete file.position;
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
            action: 'TCC_SYNTHETIC_OBSERVATION_CLARIFIED',
            resourceType: 'TestExecutionStep',
            resourceId: 89,
            reasonCode: 'TCC_BANCA_2026_V2',
            requestId: 'tcc-banca-2026-v2-step-89',
            metadata: { version: 1, count: 1, source: 'SYNTHETIC_DATA_CORRECTION' }
          })
        });
        return { evidenceId: evidence.id, auditId: audit.id };
      });
      committed = true;
      await storage.cleanup(attempt, { committed: true });
      attempt = null;
      const afterHash = hash(await inventory(ids));
      journal.inventoryHash = afterHash;
      journal.authorizedRevisions = [
        ...(journal.authorizedRevisions || []),
        {
          revision: 'video-v2',
          stepId: 89,
          auditId: result.auditId,
          beforeFingerprint: beforeHash,
          afterFingerprint: afterHash
        }
      ];
      await writeFile(journalPath + '.tmp', JSON.stringify(journal, null, 2), { mode: 0o600 });
      await rename(journalPath + '.tmp', journalPath);
      const final = {
        ...proof,
        ...result,
        afterFingerprint: afterHash,
        status: 'APPLIED',
        correctedAt: new Date().toISOString()
      };
      await writeFile(correctionPath, JSON.stringify(final, null, 2), { mode: 0o600 });
      await writeFile(resolve(out, 'CORRECAO-QA.json'), JSON.stringify(final, null, 2));
      console.log(JSON.stringify({ status: 'APPLIED', executionId: 57, stepId: 89, ...result }));
    }
  }
} catch (e) {
  console.error(e.message.slice(0, 700));
  process.exitCode = 1;
} finally {
  if (attempt) await storage.cleanup(attempt, { committed });
  if (lock) {
    await lock.close();
    await unlink(resolve('.local/tcc-banca-2026-v2/correcao.lock'));
  }
  await disconnectDatabase();
}
