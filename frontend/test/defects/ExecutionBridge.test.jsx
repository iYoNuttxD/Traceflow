import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { TestCaseDialogContent } from '../../src/features/testCases/components/TestCaseDialogContent.jsx';
import { execution } from '../testCases/fixtures.js';
const read = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({
  testCasesApi: { execution: read }
}));
beforeEach(() =>
  read.mockResolvedValue({
    ...execution,
    steps: execution.steps.map((s, i) => ({
      ...s,
      result: i === 0 ? 'FAIL' : 'PASS',
      observedResult: i === 0 ? 'Falha' : null,
      detectedDefects: []
    }))
  })
);
const props = {
  dialog: { type: 'execution', caseId: 15, executionId: 38 },
  headerKey: 'execution:15:38',
  onLoaded: () => {},
  canWrite: true
};
it('exposes creation only on FAIL and preserves committed defects across returns', async () => {
  const create = vi.fn(),
    open = vi.fn(),
    user = userEvent.setup();
  const saved = {
    id: 1,
    title: 'Primeiro',
    detectedExecutionStepId: 101,
    severity: 'ALTA',
    status: 'ABERTO'
  };
  const ui = (receipts) => (
    <MemoryRouter>
      <TestCaseDialogContent
        {...props}
        onCreateDefect={create}
        onOpenDefect={open}
        defectReceipt={receipts}
      />
    </MemoryRouter>
  );
  const view = render(ui([]));
  await user.click(await screen.findByRole('button', { name: 'Registrar defeito' }));
  expect(create).toHaveBeenCalledOnce();
  expect(create.mock.calls[0][1].id).toBe(101);
  view.rerender(
    ui([
      { kind: 'create', saved },
      { kind: 'create', saved: { ...saved, id: 2, title: 'Segundo' } }
    ])
  );
  expect(screen.getByRole('button', { name: 'DEF-1 · Primeiro' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'DEF-2 · Segundo' }));
  expect(open).toHaveBeenCalledWith(2);
  view.rerender(
    ui([
      { kind: 'create', saved },
      { kind: 'delete', id: 1 }
    ])
  );
  expect(screen.queryByRole('button', { name: 'DEF-1 · Primeiro' })).not.toBeInTheDocument();
  expect(read).toHaveBeenCalledOnce();
});
it('never exposes FAIL mutations to a viewer', async () => {
  render(
    <MemoryRouter>
      <TestCaseDialogContent {...props} canWrite={false} />
    </MemoryRouter>
  );
  await screen.findByText('Pessoa QA histórica');
  expect(screen.queryByRole('button', { name: 'Registrar defeito' })).not.toBeInTheDocument();
});
