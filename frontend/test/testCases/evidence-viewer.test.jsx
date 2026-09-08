import { Blob } from 'node:buffer';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvidenceViewer } from '../../src/features/testCases/components/EvidenceViewer.jsx';
import { EvidenceDownloadButton } from '../../src/features/testCases/components/PersistedEvidence.jsx';
import { TestCaseDetails } from '../../src/features/testCases/components/TestCaseDetails.jsx';
import { useEvidenceContent } from '../../src/features/testCases/hooks/useEvidenceContent.js';
import { TEXT_PREVIEW_LIMIT } from '../../src/features/testCases/model/evidence-viewer.js';
import { deferred, testCase } from './fixtures.js';
const content = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({
  testCasesApi: { content }
}));
const imageFile = { id: 1, originalName: 'passo.png', mimeType: 'image/png', sizeBytes: 100 };
function Viewer({ file = imageFile, projectId = 1 }) {
  const resource = useEvidenceContent(file, projectId);
  return (
    file && (
      <>
        <EvidenceDownloadButton file={file} blob={resource.blob} disabled={resource.loading} />
        <EvidenceViewer key={file.id} file={file} content={resource} onBack={vi.fn()} />
      </>
    )
  );
}
let create, revoke, anchor, errors, warnings;
beforeEach(() => {
  content.mockReset();
  create = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation(() => `blob:evidence-${create.mock.calls.length}`);
  revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  expect(errors).not.toHaveBeenCalled();
  expect(warnings).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
function respond(mimeType, text = 'evidence') {
  const blob = new Blob([text], { type: mimeType });
  content.mockResolvedValue({ data: blob });
  return blob;
}
describe('persisted viewer formats and safety', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'previews %s and reuses its blob for download',
    async (mimeType) => {
      respond(mimeType);
      const view = render(<Viewer file={{ ...imageFile, mimeType }} />);
      const img = await screen.findByRole('img', { name: 'Evidência passo.png' });
      expect(img).toHaveAttribute('src', 'blob:evidence-1');
      await userEvent.setup().click(screen.getByRole('button', { name: 'Baixar passo.png' }));
      expect(content).toHaveBeenCalledOnce();
      expect(anchor).toHaveBeenCalledOnce();
      expect(anchor.mock.instances[0].download).toBe('passo.png');
      view.unmount();
      expect(revoke).toHaveBeenCalledWith('blob:evidence-1');
      await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:evidence-2'));
    }
  );
  it.each(['video/mp4', 'video/webm', 'video/quicktime'])(
    'offers native %s controls and a codec error fallback',
    async (mimeType) => {
      respond(mimeType);
      const { container } = render(
        <Viewer file={{ ...imageFile, mimeType, originalName: 'video.mov' }} />
      );
      await waitFor(() => expect(container.querySelector('video')).toBeInTheDocument());
      const video = container.querySelector('video');
      expect(video).toHaveAttribute('controls');
      expect(video).not.toHaveAttribute('autoplay');
      expect(video).toHaveAttribute('preload', 'metadata');
      fireEvent.error(video);
      expect(screen.getByRole('status')).toHaveTextContent(
        'Este navegador não consegue reproduzir este vídeo.'
      );
      expect(screen.getByText('Baixar arquivo')).toBeInTheDocument();
    }
  );
  it('uses a native PDF object with its browser fallback', async () => {
    respond('application/pdf');
    render(
      <Viewer file={{ ...imageFile, mimeType: 'application/pdf', originalName: 'relatorio.pdf' }} />
    );
    const pdf = await screen.findByLabelText('PDF relatorio.pdf');
    expect(pdf).toHaveAttribute('type', 'application/pdf');
    expect(pdf).toHaveAttribute('data', 'blob:evidence-1');
    expect(within(pdf).getByText('Baixar PDF')).toBeInTheDocument();
  });
  it.each(['evidence.txt', 'server.log'])(
    'renders %s as literal text, including HTML-like input',
    async (originalName) => {
      const literal = '<script>alert(1)</script>\n<div onclick="x()">plain text</div>';
      respond('text/plain', literal);
      const { container } = render(
        <Viewer file={{ ...imageFile, mimeType: 'text/plain', originalName }} />
      );
      const pre = await screen.findByLabelText(`Conteúdo de ${originalName}`);
      expect(pre.textContent).toBe(literal);
      expect(pre.tagName).toBe('PRE');
      expect(pre.querySelector('script')).toBeNull();
      expect(container.querySelector('iframe')).toBeNull();
      expect(create).not.toHaveBeenCalled();
    }
  );
  it('formats JSON without a highlighter or HTML renderer', async () => {
    respond('application/json', '{"ok":true,"nested":{"count":3}}');
    render(<Viewer file={{ ...imageFile, mimeType: 'application/json' }} />);
    expect((await screen.findByLabelText('Conteúdo de passo.png')).textContent).toBe(
      JSON.stringify({ ok: true, nested: { count: 3 } }, null, 2)
    );
  });
  it('preserves download for malformed JSON', async () => {
    respond('application/json', '{broken');
    render(<Viewer file={{ ...imageFile, mimeType: 'application/json' }} />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Não foi possível interpretar o JSON.')
    );
    await userEvent.setup().click(screen.getByText('Baixar arquivo'));
    expect(content).toHaveBeenCalledOnce();
    expect(anchor).toHaveBeenCalledOnce();
  });
  it.each(['text/plain', 'application/json'])(
    'rejects large %s metadata before fetching',
    (mimeType) => {
      render(<Viewer file={{ ...imageFile, mimeType, sizeBytes: TEXT_PREVIEW_LIMIT + 1 }} />);
      expect(screen.getByRole('status')).toHaveTextContent('grande demais');
      expect(content).not.toHaveBeenCalled();
      expect(screen.queryByText('Carregando evidência…')).not.toBeInTheDocument();
    }
  );
  it('checks actual blob size before reading text even if metadata understates it', async () => {
    const blob = respond('text/plain', 'x'.repeat(TEXT_PREVIEW_LIMIT + 1));
    const read = vi.spyOn(blob, 'text');
    render(<Viewer file={{ ...imageFile, mimeType: 'text/plain' }} />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('grande demais'));
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    'image/svg+xml',
    'text/html',
    'application/zip',
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ])('never embeds unsupported %s', (mimeType) => {
    const { container } = render(<Viewer file={{ ...imageFile, mimeType }} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Visualização não disponível para este formato.'
    );
    expect(content).not.toHaveBeenCalled();
    expect(container.querySelector('img,video,object,iframe,pre')).toBeNull();
  });
  it('does not embed an HTML response mislabeled as a PDF in metadata', async () => {
    respond('text/html', '<html>Sign in</html>');
    const { container } = render(<Viewer file={{ ...imageFile, mimeType: 'application/pdf' }} />);
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('formato recebido não corresponde')
    );
    expect(container.querySelector('object')).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it('shows an image error fallback', async () => {
    respond('image/png');
    render(<Viewer />);
    fireEvent.error(await screen.findByRole('img'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Não foi possível visualizar esta imagem.'
    );
  });
});
describe('current evidence ownership', () => {
  it('aborts A on back; late A cannot replace B', async () => {
    const a = deferred(),
      b = deferred();
    content.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const view = render(<Viewer />);
    expect(screen.getByText('Carregando evidência…')).toBeInTheDocument();
    const signal = content.mock.calls[0][1].signal;
    view.rerender(<Viewer file={null} />);
    expect(signal.aborted).toBe(true);
    view.rerender(<Viewer file={{ ...imageFile, id: 2, originalName: 'B.png' }} />);
    await act(async () => b.resolve({ data: new Blob(['B'], { type: 'image/png' }) }));
    expect(screen.getByRole('img')).toHaveAccessibleName('Evidência B.png');
    await act(async () => a.resolve({ data: new Blob(['A'], { type: 'image/png' }) }));
    expect(screen.getByRole('img')).toHaveAccessibleName('Evidência B.png');
    expect(create).toHaveBeenCalledOnce();
  });
  it.each(['back', 'close', 'switch', 'project'])(
    'revokes the current object URL on %s',
    async (action) => {
      respond('image/png');
      const view = render(<Viewer />);
      await screen.findByRole('img');
      if (action === 'close') view.unmount();
      if (action === 'back') view.rerender(<Viewer file={null} />);
      if (action === 'switch') view.rerender(<Viewer file={{ ...imageFile, id: 2 }} />);
      if (action === 'project') view.rerender(<Viewer projectId={2} />);
      expect(revoke).toHaveBeenCalledWith('blob:evidence-1');
      await act(async () => {});
    }
  );
  it('does not reuse a revoked URL when reopening the same evidence', async () => {
    respond('image/png');
    const view = render(<Viewer />);
    await screen.findByRole('img');
    view.rerender(<Viewer file={null} />);
    const pending = deferred();
    content.mockReturnValueOnce(pending.promise);
    view.rerender(<Viewer />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await act(async () => pending.resolve({ data: new Blob(['new'], { type: 'image/png' }) }));
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:evidence-2');
  });
  it.each(['unmount', 'project'])('rejects late transport after %s', async (action) => {
    const a = deferred(),
      b = deferred();
    content.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const view = render(<Viewer />);
    const signal = content.mock.calls[0][1].signal;
    if (action === 'unmount') view.unmount();
    else view.rerender(<Viewer projectId={2} />);
    await act(async () => a.resolve({ data: new Blob(['old'], { type: 'image/png' }) }));
    expect(signal.aborted).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('discards text decoding that finishes after evidence changes', async () => {
    const text = deferred();
    const blob = new Blob(['{}'], { type: 'application/json' });
    vi.spyOn(blob, 'text').mockReturnValue(text.promise);
    content.mockResolvedValueOnce({ data: blob });
    const view = render(<Viewer file={{ ...imageFile, mimeType: 'application/json' }} />);
    await waitFor(() => expect(blob.text).toHaveBeenCalled());
    respond('image/png');
    view.rerender(<Viewer file={{ ...imageFile, id: 2 }} />);
    await screen.findByRole('img');
    await act(async () => text.resolve('{"stale":true}'));
    expect(screen.queryByText(/stale/)).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
  it('retries a failed read with a fresh identity and offers back', async () => {
    content.mockRejectedValueOnce(new Error('network'));
    const view = render(<Viewer />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar esta evidência.'
    );
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    respond('image/png');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByRole('img');
    expect(content).toHaveBeenCalledTimes(2);
    expect(content.mock.calls[0][1].signal.aborted).toBe(true);
    view.unmount();
  });
});
describe('canonical traceability with actual minimal DTO', () => {
  it('uses two canonical categories, three separated tasks and no decorative icons or invented metadata', () => {
    const data = {
      ...testCase,
      tasks: Array.from({ length: 3 }, (_, i) => ({ id: i + 1, title: `Tarefa ${i + 1}` }))
    };
    const { container } = render(
      <MemoryRouter>
        <TestCaseDetails testCase={data} projectId={1} />
      </MemoryRouter>
    );
    const trace = screen.getByRole('region', { name: 'Rastreabilidade' });
    expect(within(trace).getByLabelText('1 requisito')).toHaveTextContent('1');
    expect(within(trace).getByLabelText('3 tarefas')).toHaveTextContent('3');
    expect(within(trace).getAllByRole('link')).toHaveLength(4);
    expect(trace.querySelectorAll('.task-detail-artifact-list > div')).toHaveLength(3);
    expect(trace.querySelector('svg')).toBeNull();
    expect(trace.textContent).not.toMatch(/undefined|—|Prioridade|Responsável/);
    expect(container.querySelectorAll('.task-detail-traceability-grid article')).toHaveLength(2);
  });
  it('shows the same canonical empty state in both categories', () => {
    render(
      <MemoryRouter>
        <TestCaseDetails
          testCase={{ ...testCase, requirementId: null, requirement: null, tasks: [] }}
          projectId={1}
        />
      </MemoryRouter>
    );
    const trace = screen.getByRole('region', { name: 'Rastreabilidade' });
    expect(within(trace).getAllByText('Nenhum vínculo')).toHaveLength(2);
    expect(within(trace).getByLabelText('0 requisito')).toHaveTextContent('0');
    expect(within(trace).getByLabelText('0 tarefas')).toHaveTextContent('0');
    expect(within(trace).queryByRole('link')).not.toBeInTheDocument();
  });
});
