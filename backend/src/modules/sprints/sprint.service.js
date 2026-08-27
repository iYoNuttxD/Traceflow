import { sprintCrudService } from './services/sprint-crud.service.js';
import { sprintStatusService } from './services/sprint-status.service.js';
import { sprintProgressService } from './services/sprint-progress.service.js';
import { milestoneService } from './services/milestone.service.js';
import { scheduleService } from './services/schedule.service.js';

export const sprintService = {
  ...sprintCrudService,
  ...sprintStatusService,
  ...sprintProgressService,
  ...milestoneService,
  ...scheduleService
};
