import { useCallback, useEffect, useRef, useState } from 'react';
import { SprintDialog } from '../../schedule/index.js';
import { FeedbackRegion, SelectControl, useConfirm } from '../../../shared/index.js';
import { METRIC_TITLES } from '../dashboard-display.js';
import './PersonalizedDashboard.css';

const CATEGORIES = {
  GENERAL: 'Geral',
  PLANNING: 'Planejamento',
  GITHUB: 'GitHub',
  FLOW: 'Fluxo',
  TASK: 'Tarefas',
  SPRINT: 'Sprint',
  QUALITY: 'Qualidade',
  TRACEABILITY: 'Rastreabilidade'
};
const categoriesOf = (item) => item.customization.categories ?? [item.category];
const categoryLabel = (item) =>
  categoriesOf(item)
    .map((id) => CATEGORIES[id])
    .join(' · ');
const titleOf = (item) => METRIC_TITLES[item.metricId] ?? item.title;
const searchText = (text) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

export function DashboardEditor({
  preference,
  catalog,
  policy,
  onSave,
  onReset,
  onSaved,
  onClose,
  returnFocusRef
}) {
  const [widgets, setWidgets] = useState(preference.widgets);
  const [reset, setReset] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [drag, setDrag] = useState(null);
  const selectedListRef = useRef(null);
  const searchRef = useRef(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const confirm = useConfirm();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const close = useCallback(() => {
    if (!inFlight.current) onClose();
  }, [onClose]);
  const eligible = catalog.filter((item) => item.customization?.customizable);
  const byId = new Map(eligible.map((item) => [item.metricId, item]));
  const dirty =
    widgets.join(',') !== preference.widgets.join(',') || (reset && !preference.isDefault);
  const valid = widgets.length >= policy.minWidgets && widgets.length <= policy.maxWidgets;
  const filtered = eligible.filter(
    (item) =>
      (!category || categoriesOf(item).includes(category)) &&
      searchText(
        `${titleOf(item)} ${item.customization.description} ${categoryLabel(item)}`
      ).includes(searchText(search))
  );

  function reorder(index, destination, focusHandle = false) {
    if (busy || destination < 0 || destination >= widgets.length || destination === index) return;
    const next = [...widgets];
    const [moved] = next.splice(index, 1);
    next.splice(destination, 0, moved);
    setWidgets(next);
    requestAnimationFrame(() => {
      const row = selectedListRef.current?.children[destination];
      const control =
        destination < index
          ? destination === 0
            ? 1
            : 0
          : destination === widgets.length - 1
            ? 0
            : 1;
      (focusHandle
        ? row?.querySelector('.dashboard-editor__drag-handle')
        : row?.querySelectorAll('.dashboard-editor__row-actions button')[control]
      )?.focus();
    });
    setReset(false);
    setAnnouncement(
      `${titleOf(byId.get(moved))}: posição ${destination + 1} de ${widgets.length}.`
    );
  }
  function endDrag() {
    setDrag(null);
  }
  function startDrag(event, id) {
    if (busy) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.setDragImage(event.currentTarget.closest('li'), 20, 20);
    setDrag({ sourceId: id, targetId: id });
  }
  function dragOver(event, id) {
    if (!drag || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (drag.targetId !== id) setDrag({ ...drag, targetId: id });
  }
  function drop(event, id) {
    if (!drag || busy) return;
    event.preventDefault();
    reorder(widgets.indexOf(drag.sourceId), widgets.indexOf(id), true);
    endDrag();
  }
  function remove(id, index) {
    setWidgets(widgets.filter((item) => item !== id));
    setReset(false);
    setAnnouncement(`${titleOf(byId.get(id))} removido.`);
    // Keep keyboard focus inside the remaining selected list after removing its button.
    requestAnimationFrame(() => {
      const rows = selectedListRef.current?.children;
      (
        rows?.[Math.min(index, rows.length - 1)]?.querySelector('button:not(:disabled)') ??
        searchRef.current
      )?.focus();
    });
  }
  async function restore() {
    if (
      !(await confirm({
        title: 'Restaurar painel padrão?',
        description:
          'A seleção será substituída pelo padrão. A alteração só será aplicada ao salvar.',
        confirmLabel: 'Restaurar',
        destructive: false
      }))
    )
      return;
    if (!alive.current) return;
    setWidgets([...policy.defaultPreference.widgets]);
    setReset(true);
    setAnnouncement('Seleção padrão restaurada. Salve para aplicar.');
  }
  async function save(event) {
    event.preventDefault();
    if (inFlight.current || !dirty || !valid) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = reset
        ? await onReset()
        : await onSave({
            configurationVersion: policy.defaultPreference.configurationVersion,
            widgets
          });
      if (alive.current && saved) onSaved({ restored: reset });
    } catch {
      if (alive.current)
        setError(
          'Não foi possível salvar o painel. Sua seleção foi mantida; tente salvar novamente.'
        );
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <SprintDialog
      open
      title="Personalizar painel"
      description="Escolha os indicadores e organize a ordem de leitura."
      size="large"
      className="dashboard-editor"
      initialFocusSelector="#dashboard-widget-search"
      returnFocusRef={returnFocusRef}
      onClose={close}
      busy={busy}
    >
      <form onSubmit={save}>
        <fieldset disabled={busy} className="dashboard-editor__fields">
          <section aria-labelledby="dashboard-selected-title">
            <div className="dashboard-editor__section-heading">
              <h3 id="dashboard-selected-title">Indicadores selecionados</h3>
              <span>
                {widgets.length} de {policy.maxWidgets} indicadores
              </span>
            </div>
            <p className="dashboard-editor__hint">Arraste pela alça ou use os botões de mover.</p>
            <span id="dashboard-reorder-help" className="sr-only">
              Use as setas para cima e para baixo no teclado para mover este indicador.
            </span>
            <ol ref={selectedListRef} className="dashboard-editor__selected">
              {widgets.map((id, index) => (
                <li
                  key={id}
                  className="dashboard-editor__selected-row"
                  data-dragging={drag?.sourceId === id || undefined}
                  data-drop={
                    drag?.targetId === id && drag.sourceId !== id
                      ? index < widgets.indexOf(drag.sourceId)
                        ? 'before'
                        : 'after'
                      : undefined
                  }
                  onDragOver={(event) => dragOver(event, id)}
                  onDrop={(event) => drop(event, id)}
                >
                  <button
                    type="button"
                    className="dashboard-editor__drag-handle"
                    draggable={!busy}
                    aria-label={`Reordenar ${titleOf(byId.get(id))}, posição ${index + 1} de ${widgets.length}`}
                    aria-describedby="dashboard-reorder-help"
                    title="Arrastar para reordenar"
                    onDragStart={(event) => startDrag(event, id)}
                    onDragEnd={endDrag}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      reorder(index, index + (event.key === 'ArrowUp' ? -1 : 1), true);
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      aria-hidden="true"
                      focusable="false"
                      fill="currentColor"
                    >
                      <circle cx="6" cy="4" r="1.4" />
                      <circle cx="12" cy="4" r="1.4" />
                      <circle cx="6" cy="9" r="1.4" />
                      <circle cx="12" cy="9" r="1.4" />
                      <circle cx="6" cy="14" r="1.4" />
                      <circle cx="12" cy="14" r="1.4" />
                    </svg>
                  </button>
                  <span className="dashboard-editor__name">{titleOf(byId.get(id))}</span>
                  <div className="dashboard-editor__row-actions">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => reorder(index, index - 1)}
                      aria-label={`Mover ${titleOf(byId.get(id))} para cima`}
                      title="Mover para cima"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={index === widgets.length - 1}
                      onClick={() => reorder(index, index + 1)}
                      aria-label={`Mover ${titleOf(byId.get(id))} para baixo`}
                      title="Mover para baixo"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(id, index)}
                      aria-label={`Remover ${titleOf(byId.get(id))} do painel`}
                      title="Remover"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {!widgets.length && <p role="status">Selecione ao menos um indicador para salvar.</p>}
          </section>
          <section aria-labelledby="dashboard-picker-title">
            <h3 id="dashboard-picker-title">Adicionar indicadores</h3>
            <div className="dashboard-editor__search">
              <label className="field">
                <span>Pesquisar indicadores</span>
                <input
                  id="dashboard-widget-search"
                  ref={searchRef}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome ou descrição"
                />
              </label>
              <label className="field">
                <span>Categoria</span>
                <SelectControl
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="">Todas</option>
                  {Object.entries(CATEGORIES).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </SelectControl>
              </label>
            </div>
            {widgets.length === policy.maxWidgets && (
              <p className="dashboard-editor__hint">
                Limite de {policy.maxWidgets} indicadores atingido. Remova um para adicionar outro.
              </p>
            )}
            <ul className="dashboard-editor__catalog">
              {filtered.map((item) => {
                const selected = widgets.includes(item.metricId);
                return (
                  <li key={item.metricId}>
                    <div>
                      <strong>{titleOf(item)}</strong>
                      <span>{categoryLabel(item)}</span>
                      <p>{item.customization.description}</p>
                    </div>
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={selected || widgets.length >= policy.maxWidgets}
                      aria-label={`${selected ? 'Selecionado' : 'Adicionar'}: ${titleOf(item)}`}
                      onClick={() => {
                        setWidgets([...widgets, item.metricId]);
                        setReset(false);
                        setAnnouncement(`${titleOf(item)} adicionado.`);
                      }}
                    >
                      {selected ? 'Selecionado' : 'Adicionar'}
                    </button>
                  </li>
                );
              })}
            </ul>
            {!filtered.length && <p>Nenhum indicador encontrado.</p>}
          </section>
        </fieldset>
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
        <FeedbackRegion error={error} />
        <footer className="dashboard-editor__footer">
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={restore}
          >
            Restaurar padrão
          </button>
          <div className="dialog-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={busy}
              onClick={close}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={busy || !dirty || !valid}
            >
              {busy ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </footer>
      </form>
    </SprintDialog>
  );
}
