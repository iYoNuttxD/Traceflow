/** Dataset sintético local da banca. Não usa GitHub nem altera fórmulas.
 * Uso (backend): node scripts/seed-tcc-banca-2026.js --dry-run|--apply|--verify
 * --clean / --rebuild exigem --apply; sem ele apenas mostram o escopo.
 * Configuração: .env local ignorado. Journal: .local/tcc-banca-2026/journal.json.
 * Eventos históricos são simulações identificadas, criadas pelos serviços no
 * relógio exclusivo deste processo. Nenhum timestamp existente é reescrito.
 */
import dotenv from 'dotenv';
import { Prisma } from '@prisma/client';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { installHomologationClock } from './lib/indicators-homologation.js';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
dotenv.config({ quiet: true });
process.env.NODE_ENV ||= 'development';
const DATASET = 'traceflow:tcc-banca-2026:v2';
const dir = resolve('.local/tcc-banca-2026');
const output = resolve('../build/tcc-banca-2026');
const journalFile = resolve(dir, 'journal.json');
const baseUrl = process.env.TCC_FRONTEND_URL || 'http://localhost:5173';
const apiUrl = process.env.TCC_API_URL || 'http://localhost:3000/api';
const args = new Set(process.argv.slice(2));
for (const arg of args)
  if (!['--dry-run', '--apply', '--verify', '--clean', '--rebuild'].includes(arg))
    throw Error('Opção desconhecida.');
if (args.has('--dry-run') && args.has('--apply'))
  throw Error('--dry-run e --apply são exclusivos.');
const assert = (value, message) => {
  if (!value) throw Error(message);
};
function parsePrivateUrl(value) {
  try {
    return new URL(value);
  } catch {
    throw Error('URL de configuração inválida; confira o arquivo local sem registrar credenciais.');
  }
}
for (const value of [baseUrl, apiUrl]) {
  const local = parsePrivateUrl(value);
  assert(
    local.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(local.hostname) &&
      !local.username &&
      !local.password,
    'API e interface devem usar HTTP local sem credenciais na URL.'
  );
}
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? String(v) : v)))
    .digest('hex');
const nativeDate = Date;
const anchor = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
  new Date()
);
let journal;
try {
  journal = JSON.parse(await readFile(journalFile, 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const day = (offset, hour = 15) =>
  new nativeDate(
    Date.parse(`${journal?.anchor || anchor}T${String(hour).padStart(2, '0')}:00:00Z`) +
      offset * 86400000
  );
const marker = (key) => `[dataset:${DATASET}:${key}]`;
const scenarios = [
  {
    key: 'portal',
    name: 'Portal do Cliente',
    health: 'HEALTHY',
    persona: 'Lucas Andrade — Desenvolvedor',
    team: 'Equipe de experiência do cliente',
    description: 'Portal para consulta e acompanhamento de solicitações de atendimento.',
    requirements: [
      [
        'RF01 — Autenticar clientes',
        'Permitir acesso autenticado ao portal e restringir as solicitações ao cliente conectado.'
      ],
      [
        'RF02 — Consultar solicitações',
        'Permitir ao cliente consultar suas solicitações por protocolo, situação e período. Exibir assunto, data de abertura e andamento, preservando os dados de outros clientes.'
      ],
      [
        'RF03 — Acompanhar atendimento',
        'Exibir a linha do tempo do atendimento e a última atualização de cada solicitação.'
      ]
    ],
    history: [
      'Definir acesso ao portal',
      'Validar sessão do cliente',
      'Preparar estrutura de solicitações',
      'Implementar busca por protocolo',
      'Organizar situação do atendimento',
      'Validar filtros e paginação'
    ],
    active: [
      'Implementar consulta de solicitações',
      'Validar autorização na consulta',
      'Preparar índices de pesquisa',
      'Ajustar estados vazios da consulta',
      'Revisar acessibilidade dos filtros',
      'Documentar critérios de aceite'
    ],
    milestones: ['Acesso e estrutura', 'Consulta de solicitações', 'Experiência de atendimento'],
    sprints: [
      'Fundação do portal',
      'Pesquisa e filtros',
      'Consulta e experiência',
      'Entrega do atendimento'
    ],
    caseTitles: [
      'CT — Acessar somente os próprios dados',
      'CT — Consultar solicitações por protocolo',
      'CT — Exibir histórico do atendimento'
    ]
  },
  {
    key: 'pedidos',
    name: 'Gestão de Pedidos',
    health: 'ATTENTION',
    persona: 'Marina Costa — Tech Lead',
    team: 'Equipe de operações comerciais',
    description:
      'Sistema de catálogo, carrinho e acompanhamento de pedidos, com entrega incremental.',
    requirements: [
      [
        'RF01 — Manter catálogo e carrinho',
        'Permitir consulta de produtos disponíveis e composição de carrinho com quantidades válidas.'
      ],
      [
        'RF02 — Consolidar pedidos',
        'Consolidar itens, descontos e total do pedido de maneira consistente.'
      ],
      ['RF03 — Acompanhar entrega', 'Exibir situação e previsão de entrega dos pedidos.']
    ],
    history: [
      'Estruturar catálogo de produtos',
      'Validar quantidades do carrinho',
      'Implementar totalização inicial',
      'Consolidar regras de desconto',
      'Persistir pedido confirmado',
      'Consultar pedidos da operação'
    ],
    active: [
      'Reconciliar reserva de estoque',
      'Validar total com descontos',
      'Integrar situação da entrega',
      'Revisar cancelamento de pedido',
      'Ajustar retorno de indisponibilidade',
      'Preparar aceite da operação'
    ],
    milestones: [
      'Catálogo e carrinho',
      'Consolidação do fluxo de pedidos',
      'Preparação da entrega'
    ],
    sprints: [
      'Catálogo e carrinho',
      'Confirmação de pedidos',
      'Consolidação e estoque',
      'Preparação da entrega'
    ],
    caseTitles: [
      'CT — Compor carrinho válido',
      'CT — Totalizar pedido com desconto',
      'CT — Atualizar previsão de entrega'
    ]
  },
  {
    key: 'pagamentos',
    name: 'Integração de Pagamentos',
    health: 'CRITICAL',
    persona: 'Fernanda Reis — Analista de QA',
    team: 'Equipe de integração e qualidade',
    description:
      'Simulador de confirmação de pagamentos. Todos os valores, referências e evidências são fictícios; não há transações financeiras reais.',
    requirements: [
      [
        'RF01 — Confirmar pagamento',
        'Registrar uma única captura para cada pagamento confirmado. A repetição da mesma confirmação deve ser idempotente e não pode produzir cobrança adicional.'
      ],
      [
        'RF02 — Validar origem da confirmação',
        'Rejeitar notificações com assinatura inválida antes de alterar a situação do pagamento.'
      ],
      [
        'RF03 — Reconciliar capturas',
        'Conciliar capturas com confirmações recebidas e disponibilizar registro de auditoria.'
      ]
    ],
    history: [
      'Definir contrato do simulador',
      'Preparar confirmação inicial',
      'Persistir identificador do pagamento',
      'Receber notificações simuladas',
      'Consultar situação da confirmação',
      'Registrar auditoria inicial'
    ],
    active: [
      'Garantir idempotência da confirmação',
      'Validar assinatura da notificação',
      'Reconciliar capturas divergentes',
      'Preparar ambiente de teste sintético',
      'Revisar tratamento de repetição',
      'Completar trilha de auditoria'
    ],
    milestones: ['Contrato e simulador', 'Confirmação segura', 'Conciliação e auditoria'],
    sprints: [
      'Contrato e simulador',
      'Confirmação inicial',
      'Segurança da confirmação',
      'Conciliação e auditoria'
    ],
    caseTitles: [
      'CT — Confirmar pagamento sem captura duplicada',
      'CT — Rejeitar confirmação com assinatura inválida',
      'CT — Identificar captura sem conciliação'
    ]
  }
];

async function save() {
  await mkdir(dir, { recursive: true });
  await writeFile(`${journalFile}.tmp`, JSON.stringify(journal, null, 2), { mode: 0o600 });
  await rename(`${journalFile}.tmp`, journalFile);
}

const target = parsePrivateUrl(process.env.DATABASE_URL);
assert(
  process.env.NODE_ENV === 'development' &&
    target.protocol === 'mysql:' &&
    ['localhost', '127.0.0.1'].includes(target.hostname) &&
    (target.port || '3306') === '3306' &&
    target.pathname === '/traceflow',
  'Exige NODE_ENV=development e MySQL local localhost:3306/traceflow.'
);
assert(
  parsePrivateUrl(process.env.TEST_DATABASE_URL).pathname !== target.pathname,
  'TEST_DATABASE_URL deve ser distinto.'
);
const { prisma, disconnectDatabase } = await import('../src/database/prismaClient.js');
const { projectCrudService } =
  await import('../src/modules/projects/services/project-crud.service.js');
const { requirementService } = await import('../src/modules/requirements/requirement.service.js');
const { taskService } = await import('../src/modules/tasks/task.service.js');
const { sprintService } = await import('../src/modules/sprints/sprint.service.js');
const { testCaseService } = await import('../src/modules/testCases/services/test-case.service.js');
const { testExecutionService } =
  await import('../src/modules/testCases/services/test-execution.service.js');
const { defectService } = await import('../src/modules/defects/defect.service.js');
const { authService } = await import('../src/modules/auth/auth.service.js');
const { env } = await import('../src/config/env.js');
const { testEvidenceStorage } =
  await import('../src/modules/testCases/storage/local-test-evidence.storage.js');
async function recordSyntheticExecution(id, input, central, context) {
  let attempt;
  if (central) {
    attempt = await testEvidenceStorage.begin();
    const text =
      'EVIDENCIA SINTETICA — BANCA TRACEFLOW 2026\nAmbiente: simulador LOCAL; nenhuma transacao financeira real.\nPagamento: PG-2026-0042 | Valor ficticio: R$ 149,90\n\n12:00:01 Primeira confirmacao -> CAP-001 | R$ 149,90 | PASS\n12:00:03 Mesma confirmacao repetida -> CAP-002 | R$ 149,90 | FAIL\n\nESPERADO: 1 captura, total R$ 149,90.\nOBSERVADO: 2 capturas, total R$ 299,80.\nA segunda captura indevida reproduz o defeito de idempotencia.\n';
    await testEvidenceStorage.receive(attempt, {
      fieldname: 'evidence',
      originalname: 'captura-duplicada-SINTETICA.txt',
      stream: Readable.from([Buffer.from(text, 'utf8')])
    });
  }
  return testExecutionService.record(id, input, attempt, context);
}
const models = Prisma.dmmf.datamodel.models;
const scopedModels = models.filter((m) =>
  m.fields.some((f) => f.name === 'projectId' && f.kind === 'scalar')
);
const delegate = (m) => m.name[0].toLowerCase() + m.name.slice(1);
async function inventory(ids) {
  const data = {};
  for (const m of scopedModels) {
    const order = m.fields.some((f) => f.name === 'id') ? { id: 'asc' } : undefined;
    data[m.name] = await prisma[delegate(m)].findMany({
      where: { projectId: { in: ids } },
      ...(order ? { orderBy: order } : {})
    });
  }
  // Include children without a projectId through their parent relationships.
  for (const [name, where] of Object.entries({
    testCaseVersion: { testCase: { projectId: { in: ids } } },
    testCaseStep: { testCase: { projectId: { in: ids } } },
    testCaseTask: { testCase: { projectId: { in: ids } } },
    testExecutionStep: { execution: { projectId: { in: ids } } },
    defectTask: { defect: { projectId: { in: ids } } }
  })) {
    if (prisma[name]) data[name] = await prisma[name].findMany({ where, orderBy: { id: 'asc' } });
  }
  return data;
}
async function externalFingerprint(ids) {
  const projects = await prisma.project.findMany({
    where: { id: { notIn: ids } },
    orderBy: { id: 'asc' }
  });
  const data = await inventory(projects.map((p) => p.id));
  return hash({ projects, data });
}
async function assertOwned(s) {
  const p = await prisma.project.findUnique({
    where: { id: s.projectId },
    include: { memberships: true, githubIntegration: true }
  });
  assert(
    p?.description?.endsWith(marker(s.key)) && p.name === s.name && !p.githubIntegration,
    'Marca/nome/integração de projeto divergente.'
  );
  assert(
    p.memberships.length === 1 &&
      p.memberships[0].userId === journal.ownerId &&
      p.memberships[0].role === 'OWNER' &&
      p.memberships[0].isActive,
    'Membership externa/divergente impede reconstrução.'
  );
  return p;
}
async function validateCleanup() {
  assert(journal?.dataset === DATASET, 'Limpeza exige journal original do dataset.');
  const ids = journal.scenarios.map((s) => s.projectId);
  for (const s of journal.scenarios) await assertOwned(s);
  assert(
    journal.inventoryHash && hash(await inventory(ids)) === journal.inventoryHash,
    'Dados mudaram após o seed: limpeza bloqueada para preservar conteúdo acrescentado.'
  );
  return ids;
}
async function cleanup() {
  await validateCleanup();
  // Project deletion uses the canonical, scoped purge path, including evidence files.
  const { projectDeletionService } =
    await import('../src/modules/projects/services/project-deletion.service.js');
  for (const s of journal.scenarios) {
    await projectDeletionService.requestDeletion(s.projectId, journal.ownerId);
    await projectDeletionService.purge(s.projectId, journal.ownerId, s.name);
  }
  await unlink(journalFile);
  journal = null;
}

async function verify(owner) {
  assert(journal?.complete, 'Dataset incompleto. Execute --apply.');
  const projects = [];
  const session = await authService.issueSession(owner);
  const cookie = `${env.sessionCookieName}=${session.token}`;
  try {
    const request = async (path) => {
      const r = await fetch(`${apiUrl}${path}`, { headers: { cookie } });
      assert(r.ok, `API ${path} retornou ${r.status}`);
      return r.json();
    };
    const accessible = await request('/projects');
    const list = Array.isArray(accessible) ? accessible : accessible.projects;
    for (const s of journal.scenarios) {
      const p = await assertOwned(s);
      assert(
        list.some((x) => x.id === s.projectId),
        'Projeto não está acessível pela conta.'
      );
      const dashboard = await request(
        `/projects/${s.projectId}/indicators/dashboard?view=GENERAL&timeZone=America%2FSao_Paulo`
      );
      const health = dashboard.projectHealth;
      assert(
        health?.status === s.health,
        `${s.name}: esperado ${s.health}, recebido ${health?.status}/${health?.score}`
      );
      const tasks = await prisma.task.findMany({ where: { projectId: s.projectId } });
      const cases = await prisma.testCase.findMany({
        where: { projectId: s.projectId },
        include: { versions: true, taskLinks: true }
      });
      const executions = await prisma.testExecution.findMany({
        where: { projectId: s.projectId },
        include: { steps: true }
      });
      const defects = await prisma.defect.findMany({
        where: { projectId: s.projectId },
        include: { detectedStep: true }
      });
      assert(
        tasks.every((t) => s.requirementIds.includes(t.requirementId)),
        'Tarefa sem requisito ou vínculo externo.'
      );
      assert(
        cases.every((c) => c.versions.length && c.taskLinks.length),
        'Caso sem versão/vínculos.'
      );
      assert(
        executions.every(
          (e) =>
            e.testedReferenceType === 'MANUAL' &&
            e.steps.length === 2 &&
            e.steps.some((st) => st.result === 'PASS')
        ),
        'Execução incoerente.'
      );
      assert(
        defects.every((d) => d.detectedStep.result === 'FAIL'),
        'Defeito sem passo FAIL.'
      );
      const counts = {
        requirements: s.requirementIds.length,
        tasks: tasks.length,
        sprints: s.sprintIds.length,
        milestones: s.milestoneIds.length,
        cases: cases.length,
        executions: executions.length,
        defects: defects.length,
        movements: await prisma.taskMovement.count({ where: { projectId: s.projectId } })
      };
      const centralIndex = s.key === 'pagamentos' ? 0 : 1;
      const central = {
        requirementId: s.requirementIds[centralIndex],
        taskId: s.activeTaskIds[0],
        sprintId: s.sprintIds[2],
        milestoneId: s.milestoneIds[1],
        testCaseId: s.caseIds[centralIndex],
        executionId: s.executionIds[centralIndex],
        defectId: s.key === 'pagamentos' ? s.defectIds[0] : null
      };
      const sprintRows = await prisma.sprint.findMany({ where: { projectId: s.projectId } });
      assert(
        sprintRows.length === 4 &&
          sprintRows.every((row) => s.milestoneIds.includes(row.milestoneId)),
        'Sprint sem marco válido do dataset.'
      );
      assert(
        (await prisma.requirement.count({ where: { projectId: s.projectId } })) === 3,
        'Quantidade de requisitos divergente.'
      );
      assert(
        (await prisma.milestone.count({ where: { projectId: s.projectId } })) === 3,
        'Quantidade de marcos divergente.'
      );
      assert(
        cases.every(
          (c) =>
            s.requirementIds.includes(c.requirementId) &&
            c.taskLinks.every((l) => tasks.some((t) => t.id === l.taskId))
        ),
        'Vínculo de caso fora do projeto.'
      );
      assert(
        defects.every((d) =>
          executions.some((e) => e.steps.some((step) => step.id === d.detectedStep.id))
        ),
        'Detecção fora das execuções verificadas.'
      );
      assert(
        (await prisma.commit.count({ where: { projectId: s.projectId } })) === 0 &&
          (await prisma.pullRequest.count({ where: { projectId: s.projectId } })) === 0,
        'Dataset local contém artefatos técnicos inesperados.'
      );
      const urls = {
        overview: `${baseUrl}/projects/${p.id}`,
        requirements: `${baseUrl}/projects/${p.id}/requirements?requirement=${s.requirementIds[s.key === 'pagamentos' ? 0 : 1]}`,
        task: `${baseUrl}/projects/${p.id}/kanban?task=${s.activeTaskIds[0]}`,
        kanban: `${baseUrl}/projects/${p.id}/kanban`,
        sprints: `${baseUrl}/projects/${p.id}/sprints`,
        schedule: `${baseUrl}/projects/${p.id}/schedule`,
        indicators: `${baseUrl}/projects/${p.id}/indicators?view=SPRINT`,
        testCase: `${baseUrl}/projects/${p.id}/test-cases?case=${central.testCaseId}`,
        execution: `${baseUrl}/projects/${p.id}/test-cases?case=${central.testCaseId}`,
        defect: s.defectIds[0]
          ? `${baseUrl}/projects/${p.id}/defects?defect=${s.defectIds[0]}`
          : null
      };
      projects.push({
        ...s,
        central,
        executionNavigation: [
          'Ver histórico',
          `Ver execução EXEC-${String(central.executionId).padStart(4, '0')}`
        ],
        owner: { id: owner.id, username: owner.username, role: 'OWNER', isActive: true },
        counts,
        health,
        urls
      });
      await mkdir(resolve(output, 'evidencias'), { recursive: true });
      await writeFile(
        resolve(output, 'evidencias', `${s.key}-dashboard-api.json`),
        JSON.stringify(dashboard, null, 2)
      );
      console.log(
        JSON.stringify({
          projectId: p.id,
          name: p.name,
          owner: owner.username,
          counts,
          health: {
            status: health.status,
            score: health.score,
            coverage: health.coverage,
            assessedDimensions: health.assessedDimensions
          }
        })
      );
    }
    const manifest = {
      dataset: DATASET,
      generatedAt: new Date().toISOString(),
      anchor: journal.anchor,
      environment: {
        nodeEnv: 'development',
        host: 'localhost',
        port: 3306,
        schema: 'traceflow',
        migrations: 86
      },
      owner: { id: owner.id, username: owner.username },
      synthetic: true,
      simulation:
        'Histórico fictício persistido por serviços canônicos em relógio de simulação exclusivo do seed.',
      healthSource:
        'GET /api/projects/:projectId/indicators/dashboard?view=GENERAL&timeZone=America/Sao_Paulo',
      projects
    };
    await writeFile(
      resolve(output, 'PROJETOS-DEMO-MANIFESTO.json'),
      JSON.stringify(manifest, null, 2)
    );
    return manifest;
  } finally {
    await authService.logout(session.session.id);
  }
}

let clock, lock;
try {
  const [server] = await prisma.$queryRaw`SELECT DATABASE() AS db, @@read_only AS ro`;
  assert(server.db === 'traceflow' && Number(server.ro) === 0, 'Servidor/schema inesperado.');
  const [migration] =
    await prisma.$queryRaw`SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert(Number(migration.n) === 86, 'Este seed exige as 86 migrations da main.');
  const owner = await prisma.user.findUnique({ where: { username: 'daniel.musse' } });
  assert(
    owner?.isActive && owner.accountStatus === 'ACTIVE',
    'Usuário existente daniel.musse precisa estar ativo.'
  );
  assert(
    !journal || (journal.dataset === DATASET && journal.ownerId === owner.id),
    'Journal de outra identidade.'
  );
  const marked = await prisma.project.findMany({
    where: { description: { contains: `[dataset:${DATASET}:` } },
    select: { id: true, name: true }
  });
  assert(
    marked.every((p) => journal?.scenarios.some((s) => s.projectId === p.id)),
    'Projeto marcado sem journal: interrompido para evitar duplicação.'
  );
  if (args.has('--verify')) {
    await verify(owner);
  } else if (!args.has('--apply')) {
    if ((args.has('--clean') || args.has('--rebuild')) && journal) await validateCleanup();
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          dataset: DATASET,
          target: { host: target.hostname, port: 3306, schema: 'traceflow' },
          owner: { id: owner.id, username: owner.username },
          operation: args.has('--rebuild') ? 'rebuild' : args.has('--clean') ? 'clean' : 'seed',
          existing: marked,
          planned: scenarios.map((s) => ({
            action: marked.some((p) => p.name === s.name) ? 'reusar sem duplicar' : 'criar',
            name: s.name,
            expectedHealth: s.health,
            requirements: 3,
            tasks: 12,
            sprints: 4,
            milestones: 3,
            cases: 3
          })),
          otherProjects: 'preservados'
        },
        null,
        2
      )
    );
  } else if (journal?.complete && !args.has('--clean') && !args.has('--rebuild')) {
    // A no-op must never bless later additions as seed-owned cleanup content.
    await verify(owner);
    console.log(JSON.stringify({ idempotentNoOp: true, ownershipFingerprintUnchanged: true }));
  } else {
    await mkdir(dir, { recursive: true });
    lock = await open(resolve(dir, 'seed.lock'), 'wx');
    await lock.writeFile(String(process.pid));
    const before = await externalFingerprint(journal?.scenarios.map((s) => s.projectId) || []);
    if (args.has('--clean') || args.has('--rebuild')) await cleanup();
    if (!args.has('--clean')) {
      if (!journal) {
        journal = {
          dataset: DATASET,
          ownerId: owner.id,
          anchor,
          steps: {},
          scenarios: [],
          complete: false
        };
        await save();
      }
      clock = installHomologationClock(prisma, models);
      const context = {
        actorUserId: owner.id,
        actor: { id: owner.id, name: owner.name },
        membershipRole: 'OWNER'
      };
      async function step(key, offset, work, recover) {
        if (Object.hasOwn(journal.steps, key)) return journal.steps[key];
        if (journal.pending && journal.pending !== key) throw Error('Etapa pendente divergente.');
        if (journal.pending) {
          const recovered = recover ? await recover() : null;
          if (recovered) {
            journal.steps[key] = recovered;
            delete journal.pending;
            await save();
            return recovered;
          }
          assert(journal.failed, 'Etapa interrompida sem confirmação: audite antes de retomar.');
        }
        journal.pending = key;
        journal.failed = false;
        await save();
        clock.at(day(offset));
        try {
          const value = await work({ ...context, requestId: `tcc26:${key}` });
          journal.steps[key] = value;
          delete journal.pending;
          await save();
          return value;
        } catch (e) {
          journal.failed = true;
          await save();
          throw e;
        }
      }
      for (const spec of scenarios) {
        let s = journal.scenarios.find((x) => x.key === spec.key);
        const projectId = await step(
          `${spec.key}:project`,
          -58,
          async () =>
            (
              await projectCrudService.createProject(
                {
                  name: spec.name,
                  description: `${spec.description}\n\n${marker(spec.key)}`,
                  responsibleTeam: spec.team
                },
                owner.id
              )
            ).id,
          async () =>
            (
              await prisma.project.findFirst({
                where: { description: { endsWith: marker(spec.key) } }
              })
            )?.id
        );
        if (!s) {
          s = {
            key: spec.key,
            name: spec.name,
            health: spec.health,
            persona: spec.persona,
            projectId,
            requirementIds: [],
            milestoneIds: [],
            sprintIds: [],
            historicTaskIds: [],
            activeTaskIds: [],
            caseIds: [],
            executionIds: [],
            defectIds: []
          };
          journal.scenarios.push(s);
          await save();
        }
        await assertOwned(s);
        for (let i = 0; i < 3; i++)
          s.requirementIds[i] = await step(
            `${s.key}:req:${i}`,
            -57,
            async () =>
              (
                await requirementService.createRequirement(projectId, {
                  title: spec.requirements[i][0],
                  description: spec.requirements[i][1],
                  type: 'FUNCIONAL'
                })
              ).id,
            async () =>
              (
                await prisma.requirement.findFirst({
                  where: { projectId, title: spec.requirements[i][0] }
                })
              )?.id
          );
        for (let i = 0; i < 3; i++)
          s.milestoneIds[i] = await step(
            `${s.key}:milestone:${i}`,
            -56,
            async (ctx) =>
              (
                await sprintService.createMilestone(
                  projectId,
                  {
                    title: spec.milestones[i],
                    description:
                      i === 1
                        ? 'Concluir o fluxo principal com critérios de aceite e validação.'
                        : 'Entrega incremental com escopo definido.',
                    dueDate: day([-39, 6, 20][i]).toISOString()
                  },
                  ctx
                )
              ).id
          );
        const ranges = [
          [-54, -39],
          [-26, -9],
          [-8, 6],
          [6, 20]
        ];
        for (let i = 0; i < 4; i++)
          s.sprintIds[i] = await step(
            `${s.key}:sprint:${i}`,
            -55,
            async (ctx) =>
              (
                await sprintService.createSprint(
                  projectId,
                  {
                    name: `Sprint ${i + 1} — ${spec.sprints[i]}`,
                    objective:
                      i === 2
                        ? 'Concluir atividades do fluxo principal e tratar os riscos identificados.'
                        : 'Entregar incremento verificável do produto.',
                    startDate: day(ranges[i][0]).toISOString(),
                    endDate: day(ranges[i][1]).toISOString(),
                    milestoneId: s.milestoneIds[i === 0 ? 0 : i === 3 ? 2 : 1]
                  },
                  ctx
                )
              ).id
          );
        const createTask = async (key, title, req, offset, deadline, estimate = 4) =>
          step(
            `${s.key}:task:${key}`,
            offset,
            async (ctx) =>
              (
                await taskService.createTask(
                  projectId,
                  {
                    title,
                    description:
                      key === 'a0' && s.key === 'portal'
                        ? 'Consultar solicitações do cliente autenticado, com filtros por protocolo, situação e período. Preservar filtros na paginação e exibir estado vazio.'
                        : `Atividade de ${spec.requirements[req][0]}. Validar o comportamento e registrar o aceite.`,
                    requirementId: s.requirementIds[req],
                    responsibleUserId: owner.id,
                    priority: key === 'a0' ? 'ALTA' : 'MEDIA',
                    estimatedEffort: estimate,
                    deadline: day(deadline).toISOString()
                  },
                  ctx
                )
              ).id
          );
        const move = async (key, id, offset, status) =>
          step(`${s.key}:move:${key}`, offset, async (ctx) => {
            await taskService.updateTaskStatus(id, status, ctx);
            return id;
          });
        const effort = async (key, id, offset, hours) =>
          step(
            `${s.key}:effort:${key}`,
            offset,
            async (ctx) =>
              (
                await taskService.createManualTaskTimeEntry(
                  id,
                  {
                    hours,
                    occurredAt: day(offset).toISOString(),
                    note: 'Atividade sintética do cenário da banca 2026.'
                  },
                  ctx
                )
              ).entry.id
          );
        for (let group = 0; group < 2; group++) {
          const createAt = group === 0 ? -55 : -27;
          for (let i = 0; i < 3; i++) {
            const n = group * 3 + i;
            const id = await createTask(
              `h${n}`,
              spec.history[n],
              (s.key === 'pagamentos' ? [0, 0, 0, 1, 0, 2] : [0, 0, 1, 1, 1, 2])[n],
              createAt,
              group === 0 ? -40 : -10
            );
            s.historicTaskIds[n] = id;
            await step(`${s.key}:scope:h${n}`, createAt, async (ctx) => {
              await taskService.linkSprint(id, { sprintId: s.sprintIds[group] }, ctx);
              return id;
            });
          }
          await step(`${s.key}:start:${group}`, ranges[group][0], async (ctx) => {
            await sprintService.updateSprintStatus(s.sprintIds[group], 'EM_ANDAMENTO', ctx);
            return s.sprintIds[group];
          });
          for (let i = 0; i < 3; i++) {
            const n = group * 3 + i,
              id = s.historicTaskIds[n];
            await move(`h${n}:start`, id, createAt + 2, 'EM_ANDAMENTO');
            const end =
              (group === 0
                ? -47
                : spec.key === 'portal'
                  ? -19
                  : spec.key === 'pedidos'
                    ? -15
                    : -12) + i;
            await effort(`h${n}`, id, end, 4);
            await move(`h${n}:done`, id, end, 'CONCLUIDO');
          }
          await step(`${s.key}:close:${group}`, ranges[group][1], async (ctx) => {
            await sprintService.updateSprintStatus(s.sprintIds[group], 'CONCLUIDA', ctx);
            return s.sprintIds[group];
          });
        }
        for (let i = 0; i < 6; i++) {
          const req = (
            s.key === 'pagamentos'
              ? [0, 1, 2, 0, 0, 2]
              : s.key === 'portal'
                ? [1, 1, 1, 1, 1, 2]
                : [1, 1, 2, 1, 0, 2]
          )[i];
          const estimates =
            s.key === 'portal'
              ? [8, 4, 4, 4, 6, 4]
              : s.key === 'pedidos'
                ? [12, 8, 8, 6, 4, 6]
                : [12, 8, 10, 4, 8, 6];
          const overdue =
            s.key === 'portal'
              ? false
              : s.key === 'pedidos'
                ? i === 0 || i === 2
                : i !== 3 && i !== 5;
          const id = await createTask(
            `a${i}`,
            spec.active[i],
            req,
            -9,
            overdue ? -2 : 5,
            estimates[i]
          );
          s.activeTaskIds[i] = id;
          await step(`${s.key}:scope:a${i}`, -9, async (ctx) => {
            await taskService.linkSprint(id, { sprintId: s.sprintIds[2] }, ctx);
            return id;
          });
        }
        await step(`${s.key}:start:2`, -8, async (ctx) => {
          await sprintService.updateSprintStatus(s.sprintIds[2], 'EM_ANDAMENTO', ctx);
          return s.sprintIds[2];
        });
        const statuses =
          s.key === 'portal'
            ? ['EM_ANDAMENTO', 'CONCLUIDO', 'CONCLUIDO', 'A_FAZER', 'EM_ANDAMENTO', 'A_FAZER']
            : s.key === 'pedidos'
              ? ['EM_ANDAMENTO', 'CONCLUIDO', 'EM_ANDAMENTO', 'A_FAZER', 'A_FAZER', 'A_FAZER']
              : ['EM_ANDAMENTO', 'EM_ANDAMENTO', 'A_FAZER', 'CONCLUIDO', 'A_FAZER', 'A_FAZER'];
        for (let i = 0; i < 6; i++)
          if (statuses[i] !== 'A_FAZER') {
            await move(`a${i}:start`, s.activeTaskIds[i], -7 + i * 0.1, 'EM_ANDAMENTO');
            await effort(
              `a${i}`,
              s.activeTaskIds[i],
              -3 + i * 0.1,
              s.key === 'portal' ? [5, 4, 4, 0, 2, 0][i] : i === 3 ? 4 : i === 1 ? 8 : 6
            );
            if (statuses[i] === 'CONCLUIDO')
              await move(`a${i}:done`, s.activeTaskIds[i], -2 + i * 0.1, 'CONCLUIDO');
          }
        for (let i = 0; i < 3; i++) {
          const central = s.key === 'pagamentos' && i === 0;
          const steps = central
            ? [
                {
                  action: 'Confirmar o pagamento sintético PG-2026-0042 uma vez.',
                  expectedResult: 'Registrar uma captura CAP-001 no valor fictício de R$ 149,90.'
                },
                {
                  action: 'Repetir a mesma confirmação com o identificador PG-2026-0042.',
                  expectedResult:
                    'Manter uma única captura; retornar a confirmação já processada, sem cobrança adicional.'
                }
              ]
            : [
                {
                  action: `Preparar os dados sintéticos de ${spec.requirements[i][0].split(' — ')[1].toLowerCase()}.`,
                  expectedResult: 'Dados válidos disponíveis no simulador local.'
                },
                {
                  action:
                    s.key === 'pagamentos'
                      ? i === 1
                        ? 'Enviar notificação com assinatura inválida.'
                        : 'Conciliar uma captura sem confirmação correspondente.'
                      : `Verificar o fluxo de ${spec.requirements[i][0].split(' — ')[1].toLowerCase()}.`,
                  expectedResult:
                    s.key === 'pagamentos'
                      ? i === 1
                        ? 'Rejeitar a notificação sem alterar o pagamento.'
                        : 'Identificar divergência e registrar a origem da captura.'
                      : 'Apresentar resultado consistente com o requisito e preservar os dados do usuário.'
                }
              ];
          const taskId =
            s.key === 'portal'
              ? i === 0
                ? s.historicTaskIds[0]
                : i === 1
                  ? s.activeTaskIds[0]
                  : s.activeTaskIds[5]
              : s.activeTaskIds[i];
          s.caseIds[i] = await step(
            `${s.key}:case:${i}`,
            -6,
            async (ctx) =>
              (
                await testCaseService.create(
                  projectId,
                  {
                    title: spec.caseTitles[i],
                    description: 'Caso sintético para validar o critério de aceite do requisito.',
                    preconditions: central
                      ? 'Simulador local disponível, pagamento PG-2026-0042 pendente e nenhuma captura registrada. Não utiliza gateway financeiro real.'
                      : 'Ambiente local com dados fictícios preparados e usuário autorizado.',
                    expectedResult: central
                      ? 'Uma única captura para o pagamento, mesmo após confirmação repetida.'
                      : steps[1].expectedResult,
                    responsibleUserId: owner.id,
                    requirementId: s.requirementIds[i],
                    taskIds: [taskId],
                    status: 'ATIVO',
                    steps
                  },
                  ctx
                )
              ).id
          );
          const fails = s.key === 'pagamentos' || (s.key === 'pedidos' && i === 2);
          const observed = central
            ? 'Foram registradas CAP-001 e CAP-002 para PG-2026-0042, ambas de R$ 149,90. A repetição gerou uma segunda captura indevida.'
            : s.key === 'pagamentos'
              ? i === 1
                ? 'A notificação inválida foi aceita e alterou a situação do pagamento.'
                : 'A captura divergente permaneceu sem origem identificada na auditoria.'
              : 'A previsão permanece desatualizada após a mudança de situação da entrega.';
          s.executionIds[i] = await step(
            `${s.key}:execution:${i}`,
            -1 + i * 0.01,
            async (ctx) =>
              (
                await recordSyntheticExecution(
                  s.caseIds[i],
                  {
                    testCaseVersion: 1,
                    environment: 'LOCAL',
                    testedReference: {
                      type: 'MANUAL',
                      version: 'Simulador sintético da banca 2026 — cenário local v1'
                    },
                    steps: [
                      {
                        position: 1,
                        result: 'PASS',
                        observedResult: 'Preparação concluída com dados sintéticos válidos.'
                      },
                      {
                        position: 2,
                        result: fails ? 'FAIL' : 'PASS',
                        observedResult: fails
                          ? observed
                          : 'Resultado corresponde ao critério de aceite.'
                      }
                    ]
                  },
                  central,
                  ctx
                )
              ).id
          );
          if (fails) {
            s.defectIds[i] = await step(`${s.key}:defect:${i}`, -0.8 + i * 0.01, async (ctx) => {
              const failStep = await prisma.testExecutionStep.findFirst({
                where: { executionId: s.executionIds[i], result: 'FAIL' }
              });
              return (
                await defectService.create(
                  projectId,
                  {
                    title: central
                      ? 'Confirmação repetida gera captura duplicada'
                      : s.key === 'pagamentos'
                        ? i === 1
                          ? 'Notificação inválida altera pagamento'
                          : 'Captura divergente sem origem na auditoria'
                        : 'Previsão de entrega não acompanha mudança de situação',
                    description: `${observed}\n\nEsperado: ${steps[1].expectedResult}\n\nCenário integralmente sintético, reproduzido no simulador local da banca.`,
                    severity: central ? 'CRITICA' : s.key === 'pagamentos' ? 'ALTA' : 'MEDIA',
                    responsibleUserId: owner.id,
                    requirementId: s.requirementIds[i],
                    originTaskIds: [taskId],
                    detectedExecutionStepId: failStep.id
                  },
                  ctx
                )
              ).id;
            });
          }
        }
        await save();
      }
      clock.restore();
      clock = null;
      journal.complete = true;
      journal.inventoryHash = hash(await inventory(journal.scenarios.map((s) => s.projectId)));
      await save();
      const after = await externalFingerprint(journal.scenarios.map((s) => s.projectId));
      assert(before === after, 'Fingerprint dos projetos externos divergiu.');
      await writeFile(
        resolve(output, 'evidencias', 'preservacao-projetos-externos.json'),
        JSON.stringify({ before, after, unchanged: true }, null, 2)
      );
      await verify(owner);
    }
  }
} catch (e) {
  console.error(
    JSON.stringify({
      error: e.message,
      code: e.code || null,
      stack: e.stack?.split('\n').slice(1, 4)
    })
  );
  process.exitCode = 1;
} finally {
  clock?.restore();
  if (lock) {
    await lock.close();
    await unlink(resolve(dir, 'seed.lock'));
  }
  await disconnectDatabase();
}
