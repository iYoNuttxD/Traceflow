import { asyncHandler } from '../../shared/http/index.js';
import { indicatorsService } from './indicators.service.js';
import { githubAnalyticsService } from './github-analytics.service.js';
import { flowTaskService } from './flow-task.service.js';
import { sprintAnalyticsService } from './sprint-analytics.service.js';

export const indicatorsController = {
  progress: asyncHandler(async (req, res) =>
    res.json(await indicatorsService.progress(req.params.projectId))
  ),
  activity: asyncHandler(async (req, res) =>
    res.json(await indicatorsService.activity(req.params.projectId, req.query))
  ),
  github: asyncHandler(async (req, res) =>
    res.json(await githubAnalyticsService.read(req.params.projectId, req.query))
  ),
  tasks: asyncHandler(async (req, res) =>
    res.json(await flowTaskService.read(req.params.projectId, req.query))
  ),
  sprints: asyncHandler(async (req, res) =>
    res.json(await sprintAnalyticsService.read(req.params.projectId, req.query))
  )
};
