import { asyncHandler } from '../../shared/http/index.js';
import { indicatorsService } from './indicators.service.js';
import { githubAnalyticsService } from './github-analytics.service.js';
import { flowTaskService } from './flow-task.service.js';
import { sprintAnalyticsService } from './sprint-analytics.service.js';
import { qualityAnalyticsService } from './quality-analytics.service.js';
import { traceabilityAnalyticsService } from './traceability-analytics.service.js';
import { dashboardService } from './dashboard.service.js';
import { publicDashboardCatalog } from './dashboard-view.catalog.js';

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
  ),
  quality: asyncHandler(async (req, res) =>
    res.json(await qualityAnalyticsService.read(req.params.projectId, req.query))
  ),
  traceability: asyncHandler(async (req, res) =>
    res.json(await traceabilityAnalyticsService.read(req.params.projectId))
  ),
  dashboard: asyncHandler(async (req, res) =>
    res.json(await dashboardService.read(req.params.projectId, req.query))
  ),
  catalog: asyncHandler(async (req, res) =>
    res.json({ projectId: Number(req.params.projectId), indicators: publicDashboardCatalog() })
  )
};
