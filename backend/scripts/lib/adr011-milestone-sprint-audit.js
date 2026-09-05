// Auditoria previa da inversao Marco <-> Sprint (ADR-011).
//
// A migration 20260823120000_adr011_invert_milestone_sprint move o vinculo para
// `Sprint.milestoneId` escolhendo, para cada sprint, o marco de MENOR prazo entre
// os seus. Uma sprint podia ter varios marcos; no novo modelo ela aponta para no
// maximo um, e os demais passam a ser marcos sem sprint. Isso e perda de
// informacao, e perda de informacao nao deve acontecer sem alguem ter lido a
// lista antes.
//
// Somente leitura. A escrita e da migration — repetir o backfill aqui criaria
// dois caminhos que podem divergir, e o unico que o banco realmente executa e o
// da migration.
//
// Consulta em SQL cru de proposito: este script roda ANTES da migration, quando
// o Prisma Client ja foi gerado a partir do schema NOVO e nao conhece mais
// `Milestone.sprintId`.

const COLUNA_AUSENTE = /Unknown column|no such column|does not exist/i;

export async function runAdr011MilestoneSprintAudit({ client }) {
  let vinculos;
  try {
    vinculos = await client.$queryRawUnsafe(`
      SELECT m.id AS marcoId, m.title AS marcoTitulo, m.dueDate AS prazo,
             m.projectId AS projectId, m.sprintId AS sprintId, s.name AS sprintNome
      FROM Milestone m
      JOIN Sprint s ON s.id = m.sprintId
      ORDER BY m.sprintId ASC, m.dueDate ASC, m.id ASC
    `);
  } catch (erro) {
    // A coluna so some depois da migration. Dizer isso e mais util do que
    // devolver o stack de um erro de SQL.
    if (COLUNA_AUSENTE.test(erro?.message || '')) {
      return {
        jaInvertido: true,
        mensagem: 'Milestone.sprintId nao existe: a migration ja foi aplicada.'
      };
    }
    throw erro;
  }

  // Agrupamento na mesma ordem do ORDER BY, que e a mesma da migration: o
  // primeiro de cada sprint e o escolhido. Reordenar aqui faria o relatorio
  // prometer um marco e a migration gravar outro.
  const porSprint = new Map();
  for (const vinculo of vinculos) {
    const chave = Number(vinculo.sprintId);
    if (!porSprint.has(chave)) porSprint.set(chave, []);
    porSprint.get(chave).push(vinculo);
  }

  const descrever = (vinculo) => ({
    marcoId: Number(vinculo.marcoId),
    titulo: vinculo.marcoTitulo,
    prazo: new Date(vinculo.prazo).toISOString()
  });

  const sprintsComVariosMarcos = [];
  const marcosQueFicamSemSprint = [];
  for (const [sprintId, marcos] of porSprint) {
    if (marcos.length < 2) continue;
    const [escolhido, ...demais] = marcos;
    sprintsComVariosMarcos.push({
      sprintId,
      sprintNome: marcos[0].sprintNome,
      projectId: Number(marcos[0].projectId),
      escolhido: descrever(escolhido),
      perdemOVinculo: demais.map(descrever)
    });
    marcosQueFicamSemSprint.push(...demais.map(descrever));
  }

  const [{ total: totalSprints }] = await client.$queryRawUnsafe(
    'SELECT COUNT(*) AS total FROM Sprint'
  );
  const [{ total: totalMarcos }] = await client.$queryRawUnsafe(
    'SELECT COUNT(*) AS total FROM Milestone'
  );

  return {
    jaInvertido: false,
    sprintsNoBanco: Number(totalSprints),
    marcosNoBanco: Number(totalMarcos),
    sprintsQueGanhamMarco: porSprint.size,
    // Sprint sem marco nenhum e estado valido: `milestoneId` fica nulo e so a
    // criacao de sprints NOVAS exige o marco.
    sprintsQueFicamSemMarco: Number(totalSprints) - porSprint.size,
    marcosQueFicamSemSprint: marcosQueFicamSemSprint.length,
    sprintsComVariosMarcos
  };
}
