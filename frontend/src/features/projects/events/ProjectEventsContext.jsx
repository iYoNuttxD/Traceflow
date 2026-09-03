import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

const defaultProjectEvents = Object.freeze({
  projectId: null,
  connectionState: 'disabled',
  reconnectSequence: 0,
  subscribe: () => () => {}
});

const ProjectEventsContext = createContext(defaultProjectEvents);

export function buildProjectEventsUrl(
  projectId,
  apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
) {
  return `${String(apiBase).replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}/events`;
}

function validEnvelope(envelope, projectId) {
  return (
    envelope &&
    typeof envelope.type === 'string' &&
    String(envelope.projectId) === String(projectId) &&
    Number.isSafeInteger(Number(envelope.taskId)) &&
    envelope.data &&
    typeof envelope.data === 'object'
  );
}

export function ProjectEventsProvider({ projectId, enabled = true, children }) {
  const listenersRef = useRef(new Set());
  const openedProjectRef = useRef(null);
  const hasOpenedRef = useRef(false);
  const needsReconciliationRef = useRef(false);
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible'
  );
  const [connectionState, setConnectionState] = useState('disabled');
  const [reconnectSequence, setReconnectSequence] = useState(0);

  const subscribe = useCallback((types, listener) => {
    const subscription = {
      listener,
      types: new Set(Array.isArray(types) ? types : [types])
    };
    listenersRef.current.add(subscription);
    return () => listenersRef.current.delete(subscription);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    const projectKey = projectId == null ? null : String(projectId);
    if (openedProjectRef.current !== projectKey) {
      openedProjectRef.current = projectKey;
      hasOpenedRef.current = false;
      needsReconciliationRef.current = false;
      setReconnectSequence(0);
    }

    if (!enabled || !projectKey) {
      setConnectionState('disabled');
      return undefined;
    }
    if (!visible) {
      setConnectionState('paused');
      return undefined;
    }
    if (typeof EventSource === 'undefined') {
      setConnectionState('unavailable');
      return undefined;
    }

    const source = new EventSource(buildProjectEventsUrl(projectKey), { withCredentials: true });
    let active = true;
    setConnectionState('connecting');

    source.onopen = () => {
      if (!active) return;
      setConnectionState('connected');
      if (hasOpenedRef.current || needsReconciliationRef.current) {
        setReconnectSequence((current) => current + 1);
      }
      hasOpenedRef.current = true;
      needsReconciliationRef.current = false;
    };
    source.onerror = () => {
      if (active) {
        needsReconciliationRef.current = true;
        setConnectionState('reconnecting');
      }
    };
    source.onmessage = (message) => {
      if (!active) return;
      try {
        const envelope = JSON.parse(message.data);
        if (!validEnvelope(envelope, projectKey)) return;
        for (const subscription of [...listenersRef.current]) {
          if (subscription.types.has(envelope.type)) subscription.listener(envelope);
        }
      } catch {
        // Payload inválido não altera estado local nem encerra a conexão válida.
      }
    };

    return () => {
      active = false;
      needsReconciliationRef.current = true;
      source.onopen = null;
      source.onerror = null;
      source.onmessage = null;
      source.close();
    };
  }, [enabled, projectId, visible]);

  const value = useMemo(
    () => ({ projectId, connectionState, reconnectSequence, subscribe }),
    [connectionState, projectId, reconnectSequence, subscribe]
  );

  return <ProjectEventsContext.Provider value={value}>{children}</ProjectEventsContext.Provider>;
}

export function useProjectEvents() {
  return useContext(ProjectEventsContext);
}
