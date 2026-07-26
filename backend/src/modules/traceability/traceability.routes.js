import { Router } from 'express';
import { validateRequest } from '../../shared/validation/index.js';
import { traceabilityController } from './traceability.controller.js';
import {
  commitSuggestionParamsSchema,
  commitSuggestionQuerySchema,
  emptyCommitSuggestionBodySchema,
  traceabilityArtifactParamsSchema,
  traceabilityPaginationQuerySchema,
  traceabilityProjectParamsSchema,
  traceabilityRequirementParamsSchema,
  traceabilityTaskParamsSchema
} from './traceability.validation.js';

const router = Router();

router.post(
  '/projects/:projectId/traceability/commit-suggestions/scan',
  validateRequest({
    params: traceabilityProjectParamsSchema,
    body: emptyCommitSuggestionBodySchema
  }),
  traceabilityController.scanCommitSuggestions
);
router.get(
  '/projects/:projectId/traceability/commit-suggestions',
  validateRequest({ params: traceabilityProjectParamsSchema, query: commitSuggestionQuerySchema }),
  traceabilityController.listCommitSuggestions
);
router.post(
  '/projects/:projectId/traceability/commit-suggestions/:suggestionId/confirm',
  validateRequest({ params: commitSuggestionParamsSchema, body: emptyCommitSuggestionBodySchema }),
  traceabilityController.confirmCommitSuggestion
);
router.post(
  '/projects/:projectId/traceability/commit-suggestions/:suggestionId/reject',
  validateRequest({ params: commitSuggestionParamsSchema, body: emptyCommitSuggestionBodySchema }),
  traceabilityController.rejectCommitSuggestion
);

router.get(
  '/projects/:projectId/traceability/requirement-task-coverage',
  validateRequest({ params: traceabilityProjectParamsSchema }),
  traceabilityController.getRequirementTaskCoverage
);
router.get(
  '/projects/:projectId/traceability/pull-request-coverage',
  validateRequest({ params: traceabilityProjectParamsSchema }),
  traceabilityController.getPullRequestCoverage
);
router.get(
  '/projects/:projectId/traceability/commit-coverage',
  validateRequest({ params: traceabilityProjectParamsSchema }),
  traceabilityController.getCommitCoverage
);
router.get(
  '/projects/:projectId/traceability/issue-coverage',
  validateRequest({ params: traceabilityProjectParamsSchema }),
  traceabilityController.getIssueCoverage
);
router.get(
  '/projects/:projectId/traceability/requirements-matrix',
  validateRequest({
    params: traceabilityProjectParamsSchema,
    query: traceabilityPaginationQuerySchema
  }),
  traceabilityController.getRequirementsMatrix
);
router.get(
  '/projects/:projectId/traceability/requirements/:requirementId',
  validateRequest({
    params: traceabilityRequirementParamsSchema,
    query: traceabilityPaginationQuerySchema
  }),
  traceabilityController.getRequirementTraceability
);
router.get(
  '/projects/:projectId/traceability/tasks/:taskId',
  validateRequest({
    params: traceabilityTaskParamsSchema,
    query: traceabilityPaginationQuerySchema
  }),
  traceabilityController.getTaskTraceability
);
router.get(
  '/projects/:projectId/traceability/artifacts/:artifactType/:artifactId',
  validateRequest({
    params: traceabilityArtifactParamsSchema,
    query: traceabilityPaginationQuerySchema
  }),
  traceabilityController.getArtifactTraceability
);

export default router;
