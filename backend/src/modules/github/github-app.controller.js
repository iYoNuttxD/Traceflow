import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/http/index.js';
import { auditService } from '../audit/audit.service.js';
import { githubAppService } from './github-app.service.js';

export const githubAppController = {
  start: asyncHandler(async (req, res) =>
    res.json(
      await githubAppService.startInstallation({
        user: req.auth.user,
        session: req.auth.session,
        ...req.body
      })
    )
  ),
  callback: asyncHandler(async (req, res) => {
    try {
      const result = await githubAppService.completeCallback({
        code: req.query.code,
        installationId: req.query.installation_id,
        setupAction: req.query.setup_action,
        state: req.query.state
      });
      await auditService.recordOperational({
        actorUserId: result.userId,
        projectId: result.projectId,
        requestId: req.requestId,
        action: 'GITHUB_APP_INSTALLATION_AUTHORIZED',
        resourceType: 'GitHubInstallation',
        resourceId: result.installation.id
      });
      const url = new URL(
        env.githubAppFrontendSuccessUrl || `${env.frontendUrl}/projects?github=connected`
      );
      url.searchParams.set('installationId', result.installation.githubInstallationId);
      url.searchParams.set('action', result.intendedAction);
      if (result.projectId) url.searchParams.set('projectId', String(result.projectId));
      return res.redirect(302, url.toString());
    } catch {
      const url = new URL(
        env.githubAppFrontendErrorUrl || `${env.frontendUrl}/projects?github=error`
      );
      url.searchParams.set('reason', 'github_callback_failed');
      return res.redirect(302, url.toString());
    }
  }),
  listInstallations: asyncHandler(async (req, res) =>
    res.json({ installations: await githubAppService.listInstallations(req.auth.user.id) })
  ),
  listRepositories: asyncHandler(async (req, res) =>
    res.json({
      repositories: await githubAppService.listRepositories(
        req.auth.user.id,
        req.params.installationId,
        req.query?.projectId
      )
    })
  ),
  connectProject: asyncHandler(async (req, res) => {
    const integration = await githubAppService.connectProject({
      projectId: req.params.projectId,
      userId: req.auth.user.id,
      ...req.body
    });
    await auditService.recordOperational({
      actorUserId: req.auth.user.id,
      projectId: req.params.projectId,
      requestId: req.requestId,
      action: 'GITHUB_PROJECT_CONNECTED',
      resourceType: 'ProjectGitHubIntegration',
      resourceId: integration.id
    });
    return res.json({ message: 'Repositório conectado pela GitHub App.', integration });
  })
};

export const githubWebhookController = {
  handle: asyncHandler(async (req, res) => {
    const result = await githubAppService.processWebhook({
      rawBody: req.body,
      signature: req.get('X-Hub-Signature-256'),
      deliveryId: req.get('X-GitHub-Delivery'),
      event: req.get('X-GitHub-Event')
    });
    return res
      .status(result.duplicate ? 200 : 202)
      .json({ accepted: true, duplicate: result.duplicate });
  })
};
