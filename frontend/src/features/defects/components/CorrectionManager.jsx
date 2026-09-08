import { useState } from 'react';
import { SearchCombobox } from '../../../shared/index.js';
import { TaskForm, emptyTaskForm, taskFormToPayload } from '../../tasks/index.js';
import { taskLabel, requirementLabel, taskStatuses } from '../model/defects.js';
export function CorrectionManager({ defect, options, busy, blocked, onSave }) {
  const [mode, setMode] = useState(null),
    [selected, setSelected] = useState(null),
    [requirement, setRequirement] = useState(defect.requirement),
    [form, setForm] = useState({
      ...emptyTaskForm,
      title: `Corrigir ${defect.displayId} — ${defect.title}`,
      requirementId: defect.requirementId ? String(defect.requirementId) : ''
    });
  const excluded = new Set(
    [
      ...defect.originTasks,
      ...(defect.correctionCycles.find((c) => c.cycle === defect.currentCorrectionCycle)?.tasks ||
        [])
    ].map((t) => t.id)
  );
  return (
    <section className="tc-stack">
      <p className="field-help">
        O status do defeito acompanha automaticamente o andamento das tarefas de correção.
      </p>
      <div className="tc-footer">
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => setMode('create')}
        >
          Criar tarefa de correção
        </button>
        <button className="button button-secondary" disabled={busy} onClick={() => setMode('link')}>
          Vincular tarefa existente
        </button>
      </div>
      {mode === 'link' && (
        <form
          className="tc-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (selected && !busy && !blocked) onSave({ taskId: selected.id });
          }}
        >
          <SearchCombobox
            label="Tarefa de correção"
            placeholder="Pesquisar tarefa..."
            onSearch={options.searchTasks}
            openOnFocus={false}
            selectedOption={selected}
            getOptionLabel={taskLabel}
            isOptionDisabled={(t) => excluded.has(t.id)}
            onSelect={setSelected}
            onClear={() => setSelected(null)}
            disabled={busy}
            renderOption={(t) => (
              <span className="tc-candidate">
                <strong>{taskLabel(t)}</strong>
                <small>
                  {taskStatuses[t.status]}
                  {t.responsible ? ` · ${t.responsible}` : ''}
                </small>
              </span>
            )}
          />
          <button
            type="submit"
            className="button button-primary"
            disabled={busy || blocked || !selected}
          >
            Vincular tarefa
          </button>
        </form>
      )}
      {mode === 'create' && (
        <fieldset className="tc-form-controls" disabled={busy || blocked}>
          <TaskForm
            composition="correction"
            formData={form}
            onChange={(key, value) => setForm((old) => ({ ...old, [key]: value }))}
            projectMembers={options.members}
            submitting={busy}
            submitLabel="Criar tarefa de correção"
            requirementControl={
              <SearchCombobox
                label="Requisito da tarefa"
                onSearch={options.searchRequirements}
                openOnFocus={false}
                getOptionLabel={requirementLabel}
                selectedOption={requirement}
                onSelect={(r) => {
                  setRequirement(r);
                  setForm((old) => ({ ...old, requirementId: String(r.id) }));
                }}
                onClear={() => {
                  setRequirement(null);
                  setForm((old) => ({ ...old, requirementId: '' }));
                }}
              />
            }
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && !blocked)
                onSave({
                  task: {
                    ...taskFormToPayload(form, false),
                    requirementId: form.requirementId ? Number(form.requirementId) : null
                  }
                });
            }}
          />
        </fieldset>
      )}
    </section>
  );
}
