import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.NODE_ENV = 'test';
const [{ createApp }, { auditService }, { githubAppService }] = await Promise.all([
  import('../../src/app.js'),
  import('../../src/modules/audit/audit.service.js'),
  import('../../src/modules/github/github-app.service.js')
]);

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('rotas públicas da GitHub App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('aceita callback sem cookie e sem CSRF e redireciona com 302', async () => {
    vi.spyOn(githubAppService, 'completeCallback').mockResolvedValue({
      installation: { id: 12, githubInstallationId: '77' },
      userId: 7,
      intendedAction: 'CREATE_PROJECT',
      projectId: null
    });
    vi.spyOn(auditService, 'recordOperational').mockResolvedValue(undefined);

    const response = await request(createApp({ logger: silentLogger })).get(
      '/api/github-app/callback?code=oauth-code&installation_id=77&setup_action=install&state=state-artificial-com-mais-de-trinta-caracteres'
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('github=connected');
    expect(githubAppService.completeCallback).toHaveBeenCalledOnce();
  });

  it('redireciona callback ausente ou inválido com erro sanitizado', async () => {
    vi.spyOn(githubAppService, 'completeCallback').mockRejectedValue(
      new Error('token=segredo-que-nao-pode-vazar')
    );
    const response = await request(createApp({ logger: silentLogger })).get(
      '/api/github-app/callback'
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('github=error');
    expect(response.headers.location).toContain('reason=github_callback_failed');
    expect(response.headers.location).not.toContain('segredo');
  });

  it('entrega os bytes originais ao webhook sem sessão nem CSRF', async () => {
    const rawBody = Buffer.from('{"action":"created","installation":{"id":77}}');
    vi.spyOn(githubAppService, 'processWebhook').mockImplementation(
      async ({ rawBody: received }) => {
        expect(Buffer.isBuffer(received)).toBe(true);
        expect(received.equals(rawBody)).toBe(true);
        return { duplicate: false };
      }
    );

    const response = await request(createApp({ logger: silentLogger }))
      .post('/api/webhooks/github-app')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=artificial')
      .set('X-GitHub-Delivery', 'delivery-1')
      .set('X-GitHub-Event', 'installation')
      .send(rawBody.toString('utf8'));

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: true, duplicate: false });
  });

  it('rejeita payload de webhook acima de 1 MiB antes do controller', async () => {
    const processWebhook = vi.spyOn(githubAppService, 'processWebhook');
    const response = await request(createApp({ logger: silentLogger }))
      .post('/api/webhooks/github-app')
      .set('Content-Type', 'application/json')
      .send(`{"padding":"${'a'.repeat(1024 * 1024)}"}`);

    expect(response.status).toBe(413);
    expect(processWebhook).not.toHaveBeenCalled();
  });

  it('mantém o início da instalação protegido por sessão', async () => {
    const response = await request(createApp({ logger: silentLogger }))
      .post('/api/github/app/installations/start')
      .send({ intendedAction: 'CREATE_PROJECT' });
    expect(response.status).toBe(401);
  });
});
