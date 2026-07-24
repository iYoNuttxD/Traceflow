import { env } from '../../config/env.js';
import { prisma } from '../../database/prismaClient.js';

export async function checkReadiness() {
  if (!env.configurationValid) return false;
  await prisma.$queryRawUnsafe('SELECT 1');
  return true;
}

export function createHealthHandlers({ readinessCheck = checkReadiness } = {}) {
  return Object.freeze({
    health(req, res) {
      return res.json({
        status: 'ok',
        message: 'TRACEFLOW backend structure is ready.'
      });
    },

    live(req, res) {
      return res.json({ status: 'ok' });
    },

    async ready(req, res) {
      try {
        const ready = await readinessCheck();
        if (!ready) throw new Error('not ready');
        return res.json({ status: 'ready' });
      } catch {
        return res.status(503).json({
          status: 'not_ready',
          message: 'Dependência essencial indisponível.'
        });
      }
    }
  });
}
