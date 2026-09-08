import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
  TestCaseCard,
  NewCaseCard
} from '../../src/features/testCases/components/TestCaseList.jsx';
import {
  ExecutionDetails,
  TestCaseDetails
} from '../../src/features/testCases/components/TestCaseDetails.jsx';
import { TestCaseHeaderActions } from '../../src/features/testCases/components/TestCaseHeaderActions.jsx';
import { testCase, execution, executionSummary, references } from './fixtures.js';

function runtimeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? runtimeFiles(path) : /\.(jsx?|css)$/.test(path) ? [path] : [];
  });
}

describe('S1-07 final UX contracts', () => {
  it('keeps fake case scenarios and the retired feature out of both runtimes', () => {
    const files = [...runtimeFiles(resolve('src')), ...runtimeFiles(resolve('../backend/src'))];
    const forbidden =
      /test-cases-prototype|testCasesPrototype|prototypeState|prototypeFixtures|mockScenario|resetScenario|prot[oó]tipo|casos de teste simulados/i;
    expect(
      files.filter((file) => forbidden.test(file) || forbidden.test(readFileSync(file, 'utf8')))
    ).toEqual([]);
    expect(
      readdirSync(resolve('src/features')).filter((name) => /test.*prototype/i.test(name))
    ).toEqual([]);
  });
  it.each([null, 'PASS', 'FAIL'])('keeps responsible, traceability and footer for %s', (result) => {
    const open = vi.fn();
    render(
      <TestCaseCard
        testCase={{
          ...testCase,
          title: 'Título longo '.repeat(40),
          taskCount: 10,
          latestExecution: result ? { ...executionSummary, result } : null
        }}
        canWrite
        onOpen={open}
      />
    );
    const card = screen.getByRole('article');
    expect(within(card).getByText('Pessoa QA')).toBeInTheDocument();
    expect(within(card).getByText('REQ-4 · Recuperação de acesso')).toBeInTheDocument();
    expect(within(card).getByText('10 tarefas relacionadas')).toBeInTheDocument();
    const footer = within(card.querySelector('footer'));
    expect(footer.getByRole('button', { name: 'Executar' })).toBeInTheDocument();
    expect(footer.getByRole('button', { name: 'Histórico' })).toBeInTheDocument();
    expect(footer.getByRole('button', { name: 'Mais ações do caso TC-15' })).toHaveTextContent('…');
    expect(card).toHaveTextContent(
      result === 'PASS' ? 'Aprovado' : result === 'FAIL' ? 'Falhou' : 'Nunca executado'
    );
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(open).toHaveBeenCalledWith('details', expect.objectContaining({ id: 15 }), card);
  });
  it('opens creation from the action card', async () => {
    const onOpen = vi.fn();
    render(<NewCaseCard onOpen={onOpen} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Novo caso de teste/ }));
    expect(onOpen).toHaveBeenCalledWith('create', null, expect.any(HTMLButtonElement));
  });
  it.each([
    ['Requisitos', /Abrir REQ-4/, 'requirements'],
    ['Tarefas', /Abrir TASK-9/, 'tasks']
  ])('navigates to canonical %s without retaining the case dialog', async (title, name, route) => {
    const onCancel = vi.fn();
    render(
      <MemoryRouter initialEntries={['/projects/1/test-cases']}>
        <Routes>
          <Route
            path="/projects/1/test-cases"
            element={
              <section role="dialog">
                <TestCaseDetails testCase={testCase} projectId={1} onCancel={onCancel} />
              </section>
            }
          />
          <Route path={`/projects/1/${route}`} element={<h1>{title}</h1>} />
        </Routes>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', `/projects/1/${route}`);
    link.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onCancel).toHaveBeenCalledOnce();
  });
  it('omits mutable header actions for VIEWER and honors current capabilities', () => {
    const { rerender } = render(<TestCaseHeaderActions testCase={testCase} canWrite={false} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(
      <TestCaseHeaderActions
        testCase={{
          ...testCase,
          capabilities: { canEdit: true, canExecute: false, canDelete: false }
        }}
        canWrite
      />
    );
    expect(screen.getByRole('button', { name: 'Executar' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Excluir caso' })).not.toBeInTheDocument();
  });
  it('keeps deletion in the compact horizontal action menu', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    try {
      const onDelete = vi.fn();
      render(<TestCaseHeaderActions testCase={testCase} canWrite onDelete={onDelete} />);
      expect(screen.queryByRole('button', { name: 'Excluir caso' })).not.toBeInTheDocument();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Mais ações do caso TC-15' }));
      await user.click(screen.getByRole('menuitem', { name: 'Excluir caso' }));
      expect(onDelete).toHaveBeenCalledOnce();
    } finally {
      window.matchMedia = original;
    }
  });
  it.each([references[0], references[1]])(
    'uses only historical reference URL for $type',
    (reference) => {
      render(<ExecutionDetails execution={{ ...execution, testedReferenceSnapshot: reference }} />);
      expect(screen.getAllByRole('heading', { name: 'Versão testada' })).toHaveLength(1);
      expect(screen.queryByText(/‹ Execuções/)).not.toBeInTheDocument();
      if (reference.githubUrl) {
        const link = screen.getByRole('link', { name: /Abrir no GitHub/ });
        expect(link).toHaveAttribute('href', reference.githubUrl);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      } else
        expect(screen.queryByRole('link', { name: /Abrir no GitHub/ })).not.toBeInTheDocument();
      expect(screen.getByText('passo3.png').closest('.tc-step-result')).toHaveTextContent(
        'Passo 3'
      );
      expect(screen.getByText('passo5.mp4').closest('.tc-step-result')).toHaveTextContent(
        'Passo 5'
      );
    }
  );
});
