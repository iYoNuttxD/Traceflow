import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTask } from '../fixtures/factories.js';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { buildAuthorizationFixture } from './helpers/authorization-fixture.js';

let app;
let prisma;
let fixture;
const period = 'startDate=2026-01-01&endDate=2026-10-14&timeZone=America/Sao_Paulo';
const VIEWS = [
  'GENERAL',
  'PLANNING',
  'GITHUB',
  'FLOW',
  'SPRINT',
  'TASK',
  'QUALITY',
  'TRACEABILITY'
];
const ENDPOINTS = [
  'progress',
  `activity?${period}`,
  `github?${period}`,
  `tasks?${period}`,
  `quality?${period}`,
  'traceability'
];

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  const { default: instance } = await import('../../src/app.js');
  app = await startTestServer(instance);
  await cleanTestDatabase(prisma);
  fixture = await buildAuthorizationFixture(app, prisma);
  for (let index = 0; index < 6; index += 1) {
    const task = await createTask(prisma, fixture.project.id, {
      title: `Tarefa de indicador ${index}`,
      responsibleUserId: fixture.accounts.member.user.id
    });
    if (index < 4) {
      const moved = await fixture.accounts.member.send('PATCH', `/api/tasks/${task.id}/move`, {
        toStatus: 'CONCLUIDO'
      });
      expect(moved.status).toBe(200);
    }
  }
}, 120000);

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

function metricValues(body) {
  const found = {};
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node.metricId === 'string' && 'value' in node && !(node.metricId in found)) {
      found[node.metricId] = node.value;
    }
    Object.values(node).forEach(walk);
  };
  walk(body);
  return found;
}

describe('H27 — o painel e o endpoint de cada indicador concordam', () => {
  it('mesmo valor para o mesmo projeto e o mesmo período', async () => {
    const owner = fixture.accounts.owner;
    const base = `/api/projects/${fixture.project.id}/indicators`;
    const panel = {};
    for (const view of VIEWS) {
      const response = await owner.send('GET', `${base}/dashboard?view=${view}&${period}`);
      expect(response.status).toBe(200);
      Object.assign(panel, metricValues(response.body));
    }
    const differences = [];
    let compared = 0;
    for (const endpoint of ENDPOINTS) {
      const response = await owner.send('GET', `${base}/${endpoint}`);
      expect(response.status, endpoint).toBe(200);
      for (const [metricId, value] of Object.entries(metricValues(response.body))) {
        if (!(metricId in panel)) continue;
        compared += 1;
        if (JSON.stringify(value) !== JSON.stringify(panel[metricId])) {
          differences.push({ endpoint, metricId, value, panel: panel[metricId] });
        }
      }
    }
    expect(compared).toBeGreaterThan(40);
    expect(differences).toEqual([]);
  }, 120000);
});
