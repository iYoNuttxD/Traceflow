import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createTaskTimeEntry,
  deleteTaskTimeEntry,
  getTaskTimeEntries,
  startTaskTimer,
  stopTaskTimer
} from '../api/tasks.api.js';
import { useProjectEvents } from '../../projects/index.js';
import { normalizeApiError } from '../../../shared/index.js';

const fallbackMessage = 'Não foi possível processar o esforço da tarefa.';
export const TIME_ENTRIES_PAGE_SIZE = 20;
export const EFFORT_EVENT_TYPES = Object.freeze([
  'task.time_entry.started',
  'task.time_entry.stopped',
  'task.time_entry.created',
  'task.time_entry.deleted'
]);

const emptyState = Object.freeze({
  running: null,
  entries: [],
  effort: null,
  permissions: { canOperate: false, canModerate: false }
});

function byMostRecent(left, right) {
  const difference = new Date(right.endedAt).getTime() - new Date(left.endedAt).getTime();
  return difference !== 0 ? difference : Number(right.id) - Number(left.id);
}

function upsertEntry(entries, entry) {
  return [entry, ...entries.filter((item) => item.id !== entry.id)].sort(byMostRecent);
}

export function applyEffortEvent(current, type, entry, effort) {
  let { running, entries } = current;
  if (type === 'task.time_entry.started') {
    running = entry;
  } else if (type === 'task.time_entry.stopped') {
    if (running?.id === entry.id) running = null;
    entries = upsertEntry(entries, entry);
  } else if (type === 'task.time_entry.created') {
    entries = upsertEntry(entries, entry);
  } else if (type === 'task.time_entry.deleted') {
    entries = entries.filter((item) => item.id !== entry.id);
    if (running?.id === entry.id) running = null;
  }
  return { ...current, running, entries, effort: effort || current.effort };
}

export function useTaskEffort({ taskId }) {
  const { reconnectSequence, subscribe } = useProjectEvents();
  const [state, setState] = useState(emptyState);
  const [loading, setLoading] = useState(Boolean(taskId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const taskRef = useRef(taskId);
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  // Relógio lógico das mudanças já observadas. Uma resposta HTTP que saiu antes
  // de um evento não pode reescrever o que o evento já aplicou: o servidor mandou
  // os dois, mas a rede não garante a ordem de chegada.
  const appliedRef = useRef(0);
  // Um buffer por leitura em voo, na chave da própria geração. Mudanças observadas
  // enquanto uma leitura viaja são reaplicadas sobre o snapshot que ela devolver;
  // com um buffer único, a leitura que terminasse primeiro apagava o buffer da
  // outra e o snapshot atrasado desfazia a mudança que já estava na tela.
  const buffersRef = useRef(new Map());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isCurrent = useCallback(
    (id) => mountedRef.current && String(taskRef.current) === String(id),
    []
  );

  // Toda mudança confirmada — evento do stream ou resposta da própria mutation —
  // passa por aqui: avança o relógio lógico, entra no buffer de cada leitura em voo
  // e vai para a tela. Sem registrar as mutations, uma leitura que saiu antes dela
  // voltava sem a sessão recém-criada e a removia da tela depois de confirmada.
  const recordChange = useCallback((type, entry, effort) => {
    appliedRef.current += 1;
    for (const buffered of buffersRef.current.values()) {
      buffered.push({ type, entry, effort });
    }
    setState((current) => applyEffortEvent(current, type, entry, effort));
  }, []);

  const load = useCallback(async () => {
    if (!taskId) return;
    const requestId = ++requestRef.current;
    const buffered = [];
    buffersRef.current.set(requestId, buffered);
    setLoading(true);
    setError('');
    try {
      const data = await getTaskTimeEntries(taskId, { limit: TIME_ENTRIES_PAGE_SIZE });
      if (requestId !== requestRef.current || !isCurrent(taskId)) return;
      const snapshot = {
        running: data.running || null,
        entries: data.entries || [],
        effort: data.effort || null,
        permissions: data.permissions || emptyState.permissions
      };
      setState(
        buffered.reduce(
          (current, event) => applyEffortEvent(current, event.type, event.entry, event.effort),
          snapshot
        )
      );
    } catch (cause) {
      if (requestId === requestRef.current && isCurrent(taskId)) {
        setError(normalizeApiError(cause, fallbackMessage).message);
      }
    } finally {
      buffersRef.current.delete(requestId);
      if (requestId === requestRef.current && isCurrent(taskId)) setLoading(false);
    }
  }, [isCurrent, taskId]);

  useEffect(() => {
    taskRef.current = taskId;
    setState(emptyState);
    setError('');
    setLoading(Boolean(taskId));
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [load, taskId]);

  useEffect(() => {
    if (reconnectSequence > 0) void load();
  }, [load, reconnectSequence]);

  // O relógio deriva do startedAt persistido; o intervalo só existe enquanto há sessão.
  useEffect(() => {
    if (!state.running) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.running]);

  useEffect(
    () =>
      subscribe(EFFORT_EVENT_TYPES, (event) => {
        if (String(event.taskId) !== String(taskRef.current)) return;
        const entry = event.data?.entry;
        if (!entry?.id) return;
        recordChange(event.type, entry, event.data.effort);
      }),
    [recordChange, subscribe]
  );

  const runAction = useCallback(
    async (action, type) => {
      if (!taskId || busy) return null;
      setBusy(true);
      setError('');
      const observedAt = appliedRef.current;
      try {
        const data = await action();
        // A escrita está confirmada no servidor mesmo quando a tela já saiu de cena;
        // o que não pode é aplicar o resultado a um contexto que não é mais este.
        if (!isCurrent(taskId)) return null;
        if (appliedRef.current !== observedAt) {
          // Algum evento chegou enquanto a resposta vinha: ela pode já estar velha
          // (ressuscitando uma sessão encerrada, por exemplo). Reler é a verdade.
          void load();
        } else {
          recordChange(type, data.entry, data.effort);
        }
        return data;
      } catch (cause) {
        if (isCurrent(taskId)) setError(normalizeApiError(cause, fallbackMessage).message);
        return null;
      } finally {
        if (isCurrent(taskId)) setBusy(false);
      }
    },
    [busy, isCurrent, load, recordChange, taskId]
  );

  const liveSeconds = state.running
    ? Math.max(0, Math.floor((now - new Date(state.running.startedAt).getTime()) / 1000))
    : 0;

  return {
    ...state,
    loading,
    busy,
    error,
    liveSeconds,
    start: () => runAction(() => startTaskTimer(taskId), 'task.time_entry.started'),
    stop: () => runAction(() => stopTaskTimer(taskId), 'task.time_entry.stopped'),
    addManual: (payload) =>
      runAction(() => createTaskTimeEntry(taskId, payload), 'task.time_entry.created'),
    remove: (entryId) =>
      runAction(() => deleteTaskTimeEntry(taskId, entryId), 'task.time_entry.deleted'),
    reload: load
  };
}
