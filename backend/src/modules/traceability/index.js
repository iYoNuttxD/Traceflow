export { traceabilityService } from './traceability.service.js';
// Fórmula canônica de percentual do produto. Exposta na fronteira para que o RF35
// meça evolução com a MESMA definição do indicador de progresso — duas fórmulas
// divergentes para o mesmo conjunto de tarefas seriam defeito de contrato.
export { buildMetric } from './traceability.calculator.js';
export { commitSuggestionService } from './commit-suggestion.service.js';
export { default as traceabilityRoutes } from './traceability.routes.js';
