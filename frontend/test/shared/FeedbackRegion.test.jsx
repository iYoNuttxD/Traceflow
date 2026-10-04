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

it('announces a late refresh failure after success expired, with one feedback and the same duration', () => {
  const app = render(<FeedbackRegion transient success="Painel salvo" />);
  act(() => vi.advanceTimersByTime(4000));
  app.rerender(<FeedbackRegion transient warning="Painel salvo. Atualização indisponível." />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(4000));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
