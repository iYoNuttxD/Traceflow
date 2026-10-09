import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FeedbackRegion } from '../../src/shared/components/FeedbackRegion.jsx';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('announces transient success outside layout, without moving focus, and expires after four seconds', () => {
  const { container } = render(<FeedbackRegion transient success="Painel salvo" />);
  const focus = document.activeElement;
  expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  expect(container).toBeEmptyDOMElement();
  act(() => vi.advanceTimersByTime(3999));
  expect(screen.getByText('Painel salvo')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(document.activeElement).toBe(focus);
});

it('announces a late refresh failure after success expired, with one persistent warning', () => {
  const app = render(<FeedbackRegion transient success="Painel salvo" />);
  act(() => vi.advanceTimersByTime(4000));
  app.rerender(<FeedbackRegion transient warning="Painel salvo. Atualização indisponível." />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(4000));
  expect(screen.getByRole('alert')).toHaveTextContent('Atualização indisponível');
});

it('cleans up the previous timer when replaced or unmounted', () => {
  const app = render(<FeedbackRegion transient success="Painel salvo" />);
  act(() => vi.advanceTimersByTime(3000));
  app.rerender(<FeedbackRegion transient success="Painel restaurado ao padrão" />);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('Painel restaurado ao padrão')).toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(1);
  app.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves canonical inline feedback and does not auto-dismiss it', () => {
  const { container } = render(<FeedbackRegion error="Não foi possível salvar" />);
  act(() => vi.advanceTimersByTime(10000));
  expect(container).toContainElement(screen.getByRole('alert'));
  expect(document.querySelector('.feedback-region--transient')).toBeNull();
});

it.each(['error', 'warning', 'rateLimit'])(
  'never auto-dismisses active %s, even with transient requested',
  (kind) => {
    render(
      <FeedbackRegion transient {...{ [kind]: 'Condição ainda vigente' }} retryAfterSeconds={3} />
    );
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByRole('alert')).toHaveTextContent('Condição ainda vigente');
  }
);
it('auto-dismisses info and retains live containers across messages', () => {
  const app = render(<FeedbackRegion transient />);
  const polite = document.querySelector('.feedback-region [aria-live="polite"]');
  app.rerender(<FeedbackRegion transient info="Atualizado" />);
  expect(document.querySelector('.feedback-region [aria-live="polite"]')).toBe(polite);
  act(() => vi.advanceTimersByTime(4000));
  expect(screen.queryByText('Atualizado')).not.toBeInTheDocument();
  expect(polite).toBeInTheDocument();
});
it('keeps the spoken rate-limit message stable while the visual countdown changes', () => {
  render(<FeedbackRegion rateLimit="Aguarde" retryAfterSeconds={3} />);
  const spoken = screen.getByRole('alert').querySelector('.sr-only');
  expect(spoken).toHaveTextContent('3 segundos');
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText('Tente novamente em 2s.')).toHaveAttribute('aria-hidden', 'true');
  expect(spoken).toHaveTextContent('3 segundos');
});
