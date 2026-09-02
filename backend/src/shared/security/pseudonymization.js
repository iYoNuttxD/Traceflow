import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';

export function fingerprintGithubUserId(githubUserId, key = env.privacyPseudonymizationKey) {
  const normalized = String(githubUserId);
  if (!/^\d+$/.test(normalized)) throw new TypeError('GitHub user ID inválido.');
  return createHmac('sha256', key).update(`traceflow:github-user:v1:${normalized}`).digest('hex');
}
