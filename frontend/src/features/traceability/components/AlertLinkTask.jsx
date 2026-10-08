import { useCallback, useState } from 'react';
import { SearchCombobox, normalizeApiError, useConfirm } from '../../../shared/index.js';
import { tasksApi } from '../../tasks/index.js';
import { taskOptionLabel } from '../model/alert-view.js';

export function AlertLinkTask({ projectId, alert, onLinked, onCancel }) {
  const confirm = useConfirm();
  const [task, setTask] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPullRequest = alert.subject.type === 'PULL_REQUEST';
  const searchTasks = useCallback(
    async (search, signal) =>
      (await tasksApi.list(projectId, { search }, { signal, fresh: true })).data.tasks,
    [projectId]
  );
  async function link(event) {
    event.preventDefault();
    if (!task) {
      setError('Escolha a tarefa que deve receber o vínculo.');
      return;
    }
    const current = isPullRequest ? task.pullRequest : null;
    if (current && current.id !== alert.subject.id) {
      const replace = await confirm({
        title: 'Substituir a pull request da tarefa?',
        description: `A tarefa TASK-${task.id} já está vinculada à PR #${current.number}. Substituir? A PR #${current.number} ficará sem tarefa e poderá gerar um novo alerta.`,
        confirmLabel: 'Substituir',
        destructive: true
      });
      if (!replace) return;
    }
    setBusy(true);
    setError('');
    try {
      if (isPullRequest) await tasksApi.linkPullRequest(task.id, alert.subject.id);
      else await tasksApi.linkIssue(task.id, alert.subject.id);
      onLinked(task);
    } catch (failure) {
      setError(normalizeApiError(failure, 'Não foi possível salvar o vínculo.').message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="trace-alert-form" onSubmit={link} noValidate>
      <p className="field-help">
        O vínculo é gravado na tarefa escolhida, como na tela de tarefas. O servidor reavalia o
        alerta em seguida.
      </p>
      <SearchCombobox
        label="Tarefa"
        placeholder="Pesquisar tarefa pelo título..."
        onSearch={searchTasks}
        openOnFocus={false}
        selectedOption={task}
        getOptionLabel={taskOptionLabel}
        onSelect={(option) => {
          setTask(option);
          setError('');
        }}
        onClear={() => setTask(null)}
        error={error}
        disabled={busy}
      />
      <div className="trace-alert-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Voltar
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={busy}
          aria-busy={busy || undefined}
        >
          Vincular à tarefa
        </button>
      </div>
    </form>
  );
}
