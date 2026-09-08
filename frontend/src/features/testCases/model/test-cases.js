// Mirrors the public S1-07 defaults; server validation remains authoritative.
export const LIMITS = Object.freeze({
  title: 200,
  description: 10000,
  preconditions: 20000,
  expectedResult: 20000,
  action: 10000,
  stepExpectedResult: 10000,
  observedResult: 20000,
  steps: 100,
  tasks: 100
});
export const EVIDENCE_LIMITS = Object.freeze({
  fileBytes: 10 * 1024 ** 2,
  videoBytes: 50 * 1024 ** 2,
  perStep: 3,
  general: 5,
  files: 20,
  totalBytes: 100 * 1024 ** 2
});
export const environments = {
  LOCAL: 'Local',
  DESENVOLVIMENTO: 'Desenvolvimento',
  HOMOLOGACAO: 'Homologação'
};
export const filterDefaults = Object.freeze({
  search: '',
  status: '',
  responsibleUserId: '',
  requirementId: '',
  taskId: '',
  latestResult: ''
});
const mime = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
  txt: 'text/plain',
  log: 'text/plain',
  json: 'application/json'
};
export const stepEvidenceExtensions = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'mov'];
export const allowedExtensions = Object.keys(mime);
export const evidenceAccept = (perStep) =>
  [
    ...new Set(
      (perStep ? stepEvidenceExtensions : allowedExtensions).flatMap((ext) => [
        `.${ext}`,
        mime[ext]
      ])
    )
  ].join(',');
export const requirementLabel = (item) => `REQ-${item.id} · ${item.title}`;
export const taskLabel = (item) => `TASK-${item.id} · ${item.title}`;
export const referenceLabel = (item) =>
  item.type === 'PULL_REQUEST'
    ? `PR #${item.number} · ${item.title}`
    : `${item.shortHash || item.hash?.slice(0, 7)} · ${item.message}`;
export const referenceOption = (item) => ({
  ...item,
  resourceId: item.id,
  id: `${item.type}:${item.id}`,
  label: referenceLabel(item)
});
export const referenceOptionLabel = (item) => item.label;
export const mergeItems = (previous, next) => [
  ...new Map([...previous, ...next].map((item) => [item.id, item])).values()
];
export const resultOf = (steps) =>
  steps.some((s) => s.result === 'FAIL')
    ? 'FAIL'
    : steps.some((s) => s.result === 'BLOCKED')
      ? 'BLOCKED'
      : steps.some((s) => !s.result)
        ? 'PENDING'
        : 'PASS';
export function stepError(step) {
  if (!['PASS', 'FAIL', 'BLOCKED'].includes(step.result)) return 'Informe o resultado do passo.';
  if (step.result !== 'PASS' && !step.observedResult.trim())
    return 'Informe o resultado observado.';
  if (step.observedResult.length > LIMITS.observedResult)
    return `Use até ${LIMITS.observedResult} caracteres.`;
  return '';
}
export function validateForm(form) {
  const errors = {};
  if (!form.requirementId && !form.taskIds?.length)
    errors.traceability = 'Vincule este caso a pelo menos um requisito ou uma tarefa.';
  for (const key of ['title', 'preconditions', 'expectedResult']) {
    if (!form[key].trim()) errors[key] = 'Campo obrigatório.';
    else if (form[key].length > LIMITS[key]) errors[key] = `Use até ${LIMITS[key]} caracteres.`;
  }
  if (form.description.length > LIMITS.description)
    errors.description = `Use até ${LIMITS.description} caracteres.`;
  if (!form.responsibleUserId) errors.responsibleUserId = 'Selecione um membro ativo.';
  if (!form.steps.length || form.steps.length > LIMITS.steps)
    errors.steps = `Informe de 1 a ${LIMITS.steps} passos.`;
  for (const step of form.steps)
    for (const key of ['action', 'expectedResult']) {
      const limit = key === 'action' ? LIMITS.action : LIMITS.stepExpectedResult;
      if (!step[key].trim()) errors[`${step.id}-${key}`] = 'Campo obrigatório.';
      else if (step[key].length > limit)
        errors[`${step.id}-${key}`] = `Use até ${limit} caracteres.`;
    }
  return errors;
}
export function definitionPayload(form, expectedVersion) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    status: form.status,
    responsibleUserId: Number(form.responsibleUserId),
    requirementId: form.requirementId ? Number(form.requirementId) : null,
    taskIds: form.taskIds.map(Number),
    preconditions: form.preconditions.trim(),
    expectedResult: form.expectedResult.trim(),
    steps: form.steps.map(({ action, expectedResult: expected }) => ({
      action: action.trim(),
      expectedResult: expected.trim()
    })),
    ...(expectedVersion ? { expectedVersion } : {})
  };
}
export function executionFormData(draft) {
  const body = new FormData();
  body.append(
    'payload',
    JSON.stringify({
      ...(draft.retest ? { retest: draft.retest } : {}),
      testCaseVersion: draft.testCaseVersion,
      environment: draft.environment,
      testedReference: { type: draft.testedReference.type, id: draft.testedReference.resourceId },
      steps: draft.stepResults.map(({ position, result, observedResult }) => ({
        position,
        result,
        observedResult: observedResult.trim() || null
      }))
    })
  );
  draft.evidences.forEach(({ file }) => body.append('evidence', file));
  draft.stepResults.forEach((step) =>
    step.evidences.forEach(({ file }) => body.append(`stepEvidence.${step.position}`, file))
  );
  return body;
}
export function evidenceError(existing, added, perStep, currentCount) {
  const extensions = perStep ? stepEvidenceExtensions : allowedExtensions;
  if (currentCount + added.length > (perStep ? EVIDENCE_LIMITS.perStep : EVIDENCE_LIMITS.general))
    return perStep ? 'Máximo de 3 arquivos por passo.' : 'Máximo de 5 arquivos gerais.';
  if (existing.length + added.length > EVIDENCE_LIMITS.files)
    return 'Máximo de 20 arquivos por execução.';
  if (
    [...existing, ...added].reduce((sum, file) => sum + file.size, 0) > EVIDENCE_LIMITS.totalBytes
  )
    return 'Máximo de 100 MiB por execução.';
  for (const file of added) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (
      !extensions.includes(ext) ||
      (file.type && file.type !== mime[ext] && file.type !== 'application/octet-stream')
    )
      return 'Formato de evidência não permitido.';
    const limit = mime[ext]?.startsWith('video/')
      ? EVIDENCE_LIMITS.videoBytes
      : EVIDENCE_LIMITS.fileBytes;
    if (!file.size || file.size > limit)
      return 'Arquivo vazio ou acima do limite: 50 MiB para vídeo e 10 MiB para outros arquivos.';
  }
  return '';
}
