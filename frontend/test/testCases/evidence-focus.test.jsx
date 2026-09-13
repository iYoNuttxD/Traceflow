import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { PersistedEvidence } from '../../src/features/testCases/components/PersistedEvidence.jsx';
import { EvidencePicker } from '../../src/features/testCases/components/Parts.jsx';
import { SprintDialog } from '../../src/features/schedule/index.js';
import { TestCaseForm } from '../../src/features/testCases/components/TestCaseForm.jsx';
import { memberData, deferred, failure } from './fixtures.js';
const content = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({
  testCasesApi: { content }
}));
const file = { id: 1, originalName: 'resultado.json', mimeType: 'application/json', sizeBytes: 34 };
let create, revoke, anchor;
beforeEach(() => {
  content.mockReset();
  create = vi.fn(() => 'blob:download-test');
  revoke = vi.fn();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  anchor.mockRestore();
  vi.unstubAllGlobals();
});
describe('private evidence lifecycle', () => {
  it('downloads once and revokes the temporary URL', async () => {
    const pending = deferred();
    content.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<PersistedEvidence evidence={[file]} />);
    const button = screen.getByRole('button', { name: 'Baixar resultado.json' });
    await user.click(button);
    expect(button).toBeDisabled();
    await act(async () => pending.resolve({ data: new Blob(['{}']) }));
    expect(content).toHaveBeenCalledTimes(1);
    expect(content).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(anchor).toHaveBeenCalledOnce();
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:download-test'));
    expect(screen.getByText(/34 bytes/)).toBeInTheDocument();
  });
  it.each([403, 404, 503])(
    'keeps historical metadata after download failure %s',
    async (status) => {
      content.mockRejectedValue(failure(status));
      const user = userEvent.setup();
      render(<PersistedEvidence evidence={[file]} />);
      await user.click(screen.getByRole('button', { name: 'Baixar resultado.json' }));
      await screen.findByRole('alert');
      expect(screen.getByText('resultado.json')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Baixar resultado.json' })).toBeEnabled();
      expect(create).not.toHaveBeenCalled();
    }
  );
  it('rejects a download completing after details unmount', async () => {
    const pending = deferred();
    content.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const view = render(<PersistedEvidence evidence={[file]} />);
    await user.click(screen.getByRole('button', { name: 'Baixar resultado.json' }));
    view.unmount();
    await act(async () => pending.resolve({ data: new Blob(['{}']) }));
    expect(create).not.toHaveBeenCalled();
    expect(anchor).not.toHaveBeenCalled();
  });
  it('revokes previews on removal and closing; accepts MIME and extensions', async () => {
    function Picker() {
      const [files, setFiles] = useState([]);
      return <EvidencePicker perStep evidences={files} onChange={setFiles} />;
    }
    const user = userEvent.setup();
    const view = render(<Picker />);
    const input = screen.getByLabelText('Adicionar foto ou vídeo');
    expect(input.accept).toContain('video/mp4');
    expect(input.accept).toContain('.mp4');
    await user.upload(input, new File(['image'], 'passo.png', { type: 'image/png' }));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:download-test');
    await user.click(screen.getByRole('button', { name: 'Remover passo.png' }));
    expect(revoke).toHaveBeenCalledTimes(1);
    await user.upload(input, new File(['image'], 'passo.png', { type: 'image/png' }));
    view.unmount();
    expect(revoke).toHaveBeenCalledTimes(2);
  });
  it('rejects a batch above three step files without partial acceptance', () => {
    const change = vi.fn();
    render(<EvidencePicker perStep evidences={[]} onChange={change} />);
    fireEvent.change(screen.getByLabelText('Adicionar foto ou vídeo'), {
      target: {
        files: Array.from(
          { length: 4 },
          (_, i) => new File(['x'], `${i}.png`, { type: 'image/png' })
        )
      }
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Máximo de 3 arquivos por passo.');
    expect(change).not.toHaveBeenCalled();
  });
});
describe('accessible error and preserved-draft focus', () => {
  it('associates normalized field errors and focuses the affected field', async () => {
    const props = {
      members: memberData.members,
      searchRequirements: vi.fn(),
      searchTasks: vi.fn(),
      onSave: vi.fn(),
      onCancel: vi.fn()
    };
    const view = render(<TestCaseForm {...props} />);
    view.rerender(<TestCaseForm {...props} serverErrors={{ title: 'Título inválido' }} />);
    await waitFor(() => expect(screen.getByLabelText('Título *')).toHaveFocus());
    expect(screen.getByLabelText('Título *')).toHaveAccessibleDescription('Título inválido');
  });
  it('traps visible focus while a draft remains hidden and a fieldset is disabled', () => {
    render(
      <SprintDialog open title="Histórico" onClose={vi.fn()}>
        <button>Visível</button>
        <div hidden>
          <button>Rascunho oculto</button>
        </div>
        <fieldset disabled>
          <button>Rascunho ocupado</button>
        </fieldset>
      </SprintDialog>
    );
    const visible = screen.getByRole('button', { name: 'Visível' });
    const close = screen.getByRole('button', { name: 'Fechar histórico' });
    visible.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(visible).toHaveFocus();
  });
});
