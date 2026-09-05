import { sprintDeletionService } from './services/sprint-deletion.service.js';
import { sprintCrudService } from './services/sprint-crud.service.js';
import { sprintStatusService } from './services/sprint-status.service.js';
import { sprintProgressService } from './services/sprint-progress.service.js';
import { milestoneService } from './services/milestone.service.js';
import { scheduleService } from './services/schedule.service.js';

export const sprintService = {
  ...sprintCrudService,
  ...sprintDeletionService,
  ...sprintStatusService,
  ...sprintProgressService,
  ...milestoneService,
  ...scheduleService
};
