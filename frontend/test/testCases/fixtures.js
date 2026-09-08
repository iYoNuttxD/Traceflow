export const memberData = {
  currentMembership: { id: 1, role: 'OWNER' },
  members: [
    { id: 1, isActive: true, user: { id: 7, name: 'Pessoa QA' } },
    { id: 2, isActive: true, user: { id: 8, name: 'Outra pessoa' } },
    { id: 3, isActive: false, user: { id: 9, name: 'Membro inativo' } }
  ]
};
export const requirement = { id: 4, title: 'Recuperação de acesso' };
export const task = { id: 9, title: 'Validar recuperação' };
export const references = [
  {
    id: 91,
    type: 'PULL_REQUEST',
    number: 42,
    title: 'Correção de acesso',
    state: 'MERGED',
    githubUrl: 'https://github.com/example/test/pull/42',
    relatedTaskIds: [9]
  },
  {
    id: 91,
    type: 'COMMIT',
    hash: 'abcdef1234567',
    shortHash: 'abcdef1',
    message: 'Ajustar recuperação',
    authorName: 'Pessoa QA',
    date: '2026-09-07T10:00:00Z',
    relatedTaskIds: []
  }
];
export const testCase = {
  id: 15,
  displayId: 'TC-15',
  projectId: 1,
  title: 'Recuperar acesso',
  description: 'Cenário de validação',
  status: 'ATIVO',
  responsible: { id: 7, name: 'Pessoa QA' },
  responsibleUserId: 7,
  currentVersion: 3,
  requirement,
  requirementId: 4,
  taskCount: 1,
  tasks: [task],
  preconditions: 'Conta disponível',
  expectedResult: 'Acesso recuperado',
  steps: Array.from({ length: 5 }, (_, i) => ({
    position: i + 1,
    action: `Ação ${i + 1} da versão 3`,
    expectedResult: `Resultado ${i + 1}`
  })),
  latestExecution: null,
  createdAt: '2026-09-07T10:00:00Z',
  updatedAt: '2026-09-07T10:00:00Z',
  capabilities: { canEdit: true, canExecute: true, canDelete: true }
};
export const snapshot = {
  schemaVersion: 1,
  title: testCase.title,
  description: testCase.description,
  preconditions: testCase.preconditions,
  expectedResult: testCase.expectedResult,
  requirement,
  tasks: [task],
  steps: testCase.steps
};
export const execution = {
  id: 38,
  displayId: 'EXEC-0038',
  projectId: 1,
  testCaseId: 15,
  testCaseVersionId: 33,
  testCaseVersion: 3,
  environment: 'HOMOLOGACAO',
  result: 'PASS',
  testedReferenceSnapshot: references[0],
  executedByUserId: 7,
  executedByDisplayNameSnapshot: 'Pessoa QA histórica',
  executedAt: '2026-09-07T11:00:00Z',
  caseVersionSnapshot: snapshot,
  steps: testCase.steps.map((s) => ({
    id: 100 + s.position,
    position: s.position,
    actionSnapshot: s.action,
    expectedResultSnapshot: s.expectedResult,
    result: 'PASS',
    observedResult: null
  })),
  evidence: [
    {
      id: 1,
      executionStepId: 103,
      originalName: 'passo3.png',
      mimeType: 'image/png',
      sizeBytes: 100
    },
    {
      id: 2,
      executionStepId: 105,
      originalName: 'passo5.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 500
    },
    {
      id: 3,
      executionStepId: null,
      originalName: 'resultado.json',
      mimeType: 'application/json',
      sizeBytes: 20
    }
  ]
};
export const executionSummary = { ...execution, testedReference: references[0] };
export const summary = {
  total: 25,
  active: 20,
  withoutTraceability: 4,
  neverExecuted: 10,
  withFailure: 3
};
export const listing = { items: [testCase], total: 1, page: 1, limit: 20, summary };
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export const failure = (status, code = 'ERROR') => ({
  response: { status, data: { code, message: 'Falha de teste' } }
});
