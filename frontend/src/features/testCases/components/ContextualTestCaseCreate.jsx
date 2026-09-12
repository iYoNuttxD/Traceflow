import { useCallback, useEffect, useRef, useState } from 'react';
import { tasksApi } from '../../tasks/index.js';
import { requirementsApi } from '../../requirements/index.js';
import { membersApi } from '../../members/index.js';
import { normalizeApiError, ErrorState, LoadingState } from '../../../shared/index.js';
import { testCasesApi } from '../api/test-cases.api.js';
import { useTestCaseScope } from '../hooks/useTestCaseScope.js';
import { TestCaseForm } from './TestCaseForm.jsx';
import '../styles/test-cases.css';
export function ContextualTestCaseCreate({
  projectId,
  task,
  requirement,
  members: initialMembers,
  onBack,
  onCreated,
  onBusyChange
}) {
  const scope = useTestCaseScope(
      `${projectId}:${task?.id || 'requirement'}:${requirement?.id || ''}`
    ),
    lock = useRef(false);
  const [members, setMembers] = useState(initialMembers || []),
    [loading, setLoading] = useState(!initialMembers),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false);
  const initialContext = useRef({
    requirement:
      requirement ||
      task?.requirement ||
      (task?.requirementId ? { id: task.requirementId, title: '' } : null),
    tasks: task ? [task] : []
  });
  useEffect(() => {
    if (initialMembers) return;
    const t = scope.begin('members');
    void membersApi
      .list(projectId, { signal: t.controller.signal, fresh: true })
      .then((d) => {
        if (scope.accepts('members', t)) {
          setMembers(d.members);
          if (d.currentMembership?.role === 'VIEWER') {
            setBlocked(true);
            setError({ message: 'Você não possui permissão para criar casos de teste.' });
          }
        }
      })
      .catch((e) => {
        if (scope.accepts('members', t)) setError(normalizeApiError(e));
      })
      .finally(() => {
        if (scope.accepts('members', t)) setLoading(false);
      });
  }, [projectId, initialMembers, scope]);
  const searchTasks = useCallback(
    async (search, signal) =>
      (await tasksApi.list(projectId, { search }, { signal, fresh: true })).data.tasks,
    [projectId]
  );
  const searchRequirements = useCallback(
    async (search, signal) =>
      (await requirementsApi.listByProject(projectId, { search }, { signal, fresh: true })).data
        .requirements,
    [projectId]
  );
  async function save(payload) {
    if (lock.current || blocked) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    const t = scope.capture();
    try {
      const saved = await testCasesApi.create(projectId, payload);
      if (scope.valid(t)) onCreated(saved);
    } catch (e) {
      if (scope.valid(t)) {
        const err = normalizeApiError(e);
        setError(
          err.code === 'TEST_CASE_TRACEABILITY_REQUIRED'
            ? { ...err, message: 'Vincule este caso a pelo menos um requisito ou uma tarefa.' }
            : err
        );
        setBlocked(err.status === 409 || err.isNetworkError || err.isTimeout);
      }
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  if (loading) return <LoadingState message="Carregando membros do projeto…" />;
  return (
    <div className="tc-stack">
      {error && <ErrorState message={error.message} />}
      <TestCaseForm
        initialContext={initialContext.current}
        members={members}
        searchTasks={searchTasks}
        searchRequirements={searchRequirements}
        busy={busy}
        blocked={blocked}
        onSave={save}
        onCancel={onBack}
      />
    </div>
  );
}
