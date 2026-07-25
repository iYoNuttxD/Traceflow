import { requirementCrudService } from './services/requirement-crud.service.js';
import { requirementStatusService } from './services/requirement-status.service.js';
import { requirementTaskService } from './services/requirement-task.service.js';

// API pública interna do módulo: agrega os casos de uso consumidos por controllers e Tasks.
export const requirementService = {
  ...requirementCrudService,
  ...requirementStatusService,
  ...requirementTaskService
};
