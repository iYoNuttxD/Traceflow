import { memberData, requirement, task } from '../testCases/fixtures.js';
export const candidate = {
  detectedExecutionStepId: 80,
  execution: {
    id: 38,
    displayId: 'EXEC-0038',
    result: 'FAIL',
    environment: 'LOCAL',
    executedAt: '2026-09-08T12:00:00Z',
    testedReference: null
  },
  testCase: { id: 15, displayId: 'TC-15', title: 'Definição histórica', version: 3 },
  failedStep: {
    id: 80,
    position: 1,
    action: 'Entrar',
    expectedResult: 'Acesso',
    observedResult: 'Falha observada',
    evidence: []
  },
  executionEvidence: [],
  suggestedRequirement: requirement,
  suggestedOriginTasks: [task],
  existingDefects: []
};
export const defect = {
  id: 1,
  displayId: 'DEF-1',
  projectId: 1,
  title: 'Acesso interrompido',
  description: 'Falha confirmada',
  severity: 'ALTA',
  status: 'ABERTO',
  responsibleUserId: 7,
  responsibleUser: { id: 7, name: 'Pessoa QA' },
  requirementId: requirement.id,
  requirement,
  originTasks: [task],
  currentCorrectionCycle: 1,
  revision: 1,
  correctionCycles: [{ cycle: 1, tasks: [] }],
  retests: [],
  statusReason: {
    correctionTasksTotal: 0,
    todo: 0,
    inProgress: 0,
    done: 0,
    validatedByExecutionId: null
  },
  detection: candidate,
  createdAt: '2026-09-08T12:00:00Z',
  correctionTaskCount: 0,
  detectionSummary: { testCaseId: 15, executionId: 38, stepPosition: 1 }
};
export const options = {
  members: memberData.members,
  searchTasks: async () => [task, { ...task, id: 10, title: 'Corrigir', status: 'CONCLUIDO' }],
  searchRequirements: async () => [requirement]
};
export { memberData, requirement, task };
