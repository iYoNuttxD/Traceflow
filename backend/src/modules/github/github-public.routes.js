import { Router } from 'express';
import { githubAppController } from './github-app.controller.js';

export const githubAppCallbackRoutes = Router();

// GitHub returns to a different origin, so this endpoint authenticates the
// installation flow with the one-time state persisted by TraceFlow.
githubAppCallbackRoutes.get('/', githubAppController.callback);
