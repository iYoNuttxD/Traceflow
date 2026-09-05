import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';

describe('HTTP fixture transport isolation', () => {
  it('keeps concurrent and sequential clients on the owning IPv4 server', async () => {
    const app = express();
    app.get('/probe/:id', (req, res) => res.json({ owner: 'fixture', id: req.params.id }));
    const [server, sameServer] = await Promise.all([startTestServer(app), startTestServer(app)]);
    expect(sameServer).toBe(server);
    const address = server.address();
    expect(address.address).toBe('127.0.0.1');
    expect(address.family).toBe('IPv4');
    const agents = Array.from({ length: 5 }, () => request.agent(server));
    for (let round = 0; round < 5; round += 1) {
      const responses = await Promise.all(agents.map((agent, id) => agent.get(`/probe/${id}`)));
      for (const [id, response] of responses.entries()) {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ owner: 'fixture', id: String(id) });
      }
      expect(server.address()).toEqual(address);
    }
  });
});
