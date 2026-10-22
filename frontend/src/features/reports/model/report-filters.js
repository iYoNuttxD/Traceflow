export const REPORT_FILTERS_DEFAULT = Object.freeze({
  status: '',
  sprintId: '',
  requestedByUserId: '',
  startDate: '',
  endDate: ''
});

// "Em geração" reúne na fila e gerando, como o selo animado dos cards.
export const REPORT_FILTER_STATUSES = Object.freeze([
  ['SUCCEEDED', 'Pronto'],
  ['ACTIVE', 'Em geração'],
  ['FAILED', 'Falhou']
]);

export const NO_SPRINT_FILTER = 'none';

export function reportFilterError(filters) {
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate)
    return 'A data final deve ser igual ou posterior à inicial.';
  return null;
}

export const countReportFilters = (filters) => Object.values(filters).filter(Boolean).length;

// Parâmetros da API: só filtros preenchidos; período inválido não é enviado.
export function reportListParams(filters) {
  const invalidPeriod = Boolean(reportFilterError(filters));
  return Object.fromEntries(
    Object.entries(filters).filter(
      ([key, value]) => value && !(invalidPeriod && (key === 'startDate' || key === 'endDate'))
    )
  );
}
