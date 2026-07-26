import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: apiMock }));
import { ProjectAuditPage } from '../../src/features/privacy/ProjectAuditPage.jsx';

describe('ProjectAuditPage', () => {
  it('renderiza a trilha administrativa minimizada do projeto', async () => {
    apiMock.get.mockResolvedValue({
      data: { events: [{ id: 1, action: 'PROJECT_MEMBER_ROLE_CHANGED', result: 'SUCCESS' }] }
    });
    render(
      <MemoryRouter initialEntries={['/projects/9/audit']}>
        <Routes>
          <Route path="/projects/:projectId/audit" element={<ProjectAuditPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/PROJECT_MEMBER_ROLE_CHANGED — SUCCESS/)).toBeInTheDocument();
    expect(apiMock.get).toHaveBeenCalledWith('/projects/9/audit-events', {});
    expect(screen.queryByText(/email|token|password/i)).not.toBeInTheDocument();
  });
});
