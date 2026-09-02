import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildProjectEventsUrl,
  ProjectEventsProvider,
  useProjectEvents
} from '../../src/features/projects/events/ProjectEventsContext.jsx';

class FakeEventSource {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.close = vi.fn();
    FakeEventSource.instances.push(this);
  }

  open() {
    this.onopen?.();
  }

  fail() {
    this.onerror?.();
  }

  message(envelope) {
    this.onmessage?.({ data: JSON.stringify(envelope) });
  }
}

function Probe({ name, onEvent }) {
  const { connectionState, reconnectSequence, subscribe } = useProjectEvents();
  useEffect(() => subscribe('task.comment.created', onEvent), [onEvent, subscribe]);
  return <span>{`${name}:${connectionState}:${reconnectSequence}`}</span>;
}

function setVisibility(value) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('ProjectEventsProvider', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mantém uma conexão autenticada por projeto para múltiplos consumidores', () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    render(
      <ProjectEventsProvider projectId={7}>
        <Probe name="first" onEvent={firstListener} />
        <Probe name="second" onEvent={secondListener} />
      </ProjectEventsProvider>
    );

    expect(FakeEventSource.instances).toHaveLength(1);
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe(buildProjectEventsUrl(7));
    expect(source.options).toEqual({ withCredentials: true });
    expect(source.url).not.toMatch(/[?&](token|session|jwt)=/i);

    act(() => source.open());
    expect(screen.getByText('first:connected:0')).toBeInTheDocument();
    source.message({
      type: 'task.comment.created',
      projectId: 7,
      taskId: 42,
      occurredAt: '2026-09-02T12:00:00.000Z',
      data: { comment: { id: 1 } }
    });
    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).toHaveBeenCalledOnce();
  });

  it('fecha quando hidden, reabre quando visible e sinaliza uma reconciliação', () => {
    const listener = vi.fn();
    render(
      <ProjectEventsProvider projectId={7}>
        <Probe name="probe" onEvent={listener} />
      </ProjectEventsProvider>
    );
    const first = FakeEventSource.instances[0];
    act(() => first.open());
    expect(screen.getByText('probe:connected:0')).toBeInTheDocument();

    act(() => setVisibility('hidden'));
    expect(first.close).toHaveBeenCalledOnce();
    expect(screen.getByText('probe:paused:0')).toBeInTheDocument();

    act(() => setVisibility('visible'));
    expect(FakeEventSource.instances).toHaveLength(2);
    const second = FakeEventSource.instances[1];
    act(() => second.open());
    expect(screen.getByText('probe:connected:1')).toBeInTheDocument();
  });

  it('reconcilia quando a primeira conexão falha antes de abrir e ignora envelopes inválidos', () => {
    const listener = vi.fn();
    render(
      <ProjectEventsProvider projectId={7}>
        <Probe name="probe" onEvent={listener} />
      </ProjectEventsProvider>
    );
    const source = FakeEventSource.instances[0];
    act(() => source.fail());
    expect(screen.getByText('probe:reconnecting:0')).toBeInTheDocument();

    source.message({ type: 'task.comment.created', projectId: 8, taskId: 42, data: {} });
    source.onmessage?.({ data: '{invalid' });
    expect(listener).not.toHaveBeenCalled();

    act(() => source.open());
    expect(screen.getByText('probe:connected:1')).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('fecha o stream anterior na troca de projeto e no unmount', () => {
    const listener = vi.fn();
    const rendered = render(
      <ProjectEventsProvider projectId={7}>
        <Probe name="probe" onEvent={listener} />
      </ProjectEventsProvider>
    );
    const first = FakeEventSource.instances[0];
    act(() => first.open());

    rendered.rerender(
      <ProjectEventsProvider projectId={8}>
        <Probe name="probe" onEvent={listener} />
      </ProjectEventsProvider>
    );
    expect(first.close).toHaveBeenCalledOnce();
    expect(FakeEventSource.instances).toHaveLength(2);
    const second = FakeEventSource.instances[1];
    act(() => second.open());
    expect(screen.getByText('probe:connected:0')).toBeInTheDocument();

    rendered.unmount();
    expect(second.close).toHaveBeenCalledOnce();
  });

  it('não cria conexão nem GET periódico com o passar de 60 segundos', () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    render(
      <ProjectEventsProvider projectId={7}>
        <Probe name="probe" onEvent={listener} />
      </ProjectEventsProvider>
    );

    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
