// Fachada que agrega os casos de uso do modulo, no mesmo padrao de task.service.js.
import { sprintCrudService } from './services/sprint-crud.service.js';
import { sprintStatusService } from './services/sprint-status.service.js';
import { milestoneService } from './services/milestone.service.js';
import { scheduleService } from './services/schedule.service.js';

export const sprintService = {
  ...sprintCrudService,
  ...sprintStatusService,
  ...milestoneService,
  ...scheduleService
};
