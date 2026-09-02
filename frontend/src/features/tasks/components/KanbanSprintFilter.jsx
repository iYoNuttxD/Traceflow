import { useEffect, useRef, useState } from 'react';
import './KanbanSprintFilter.css';

// Filtro do quadro por sprint.
//
// Seleção múltipla e não um `<select>` simples: acompanhar duas sprints ao mesmo
// tempo é o caso normal na virada de uma para a outra, quando tarefas ainda
// estão migrando. Sem filtro, o quadro mostra o projeto inteiro — inclusive o
// backlog —, que é o comportamento de sempre.
export function KanbanSprintFilter({ sprints, selectedIds, statusLabels = {}, onToggle, onClear }) {
  const [aberto, setAberto] = useState(false);
  const container = useRef(null);

  // Fechar ao clicar fora e no Escape. Um popover que só fecha pelo próprio
  // botão vira obstáculo assim que o usuário decide fazer outra coisa.
  useEffect(() => {
    if (!aberto) return undefined;
    const foraDoPopover = (event) => {
      if (!container.current?.contains(event.target)) setAberto(false);
    };
    const noEscape = (event) => {
      if (event.key === 'Escape') setAberto(false);
    };
    document.addEventListener('pointerdown', foraDoPopover);
    document.addEventListener('keydown', noEscape);
    return () => {
      document.removeEventListener('pointerdown', foraDoPopover);
      document.removeEventListener('keydown', noEscape);
    };
  }, [aberto]);

  const selecionadas = sprints.filter((sprint) => selectedIds.includes(sprint.id));
  const resumo = selecionadas.length
    ? `Exibindo ${selecionadas.length === 1 ? '1 sprint' : `${selecionadas.length} sprints`}: ${selecionadas
        .map((sprint) => sprint.name)
        .join(', ')}.`
    : 'Sem filtro — exibindo todas as tarefas do projeto.';

  return (
    <div className="kanban-owner-field kanban-sprint-filter" ref={container}>
      <strong>Sprints no quadro</strong>
      <p className="field-help">{resumo}</p>
      <div className="kanban-sprint-filter-actions">
        <button
          type="button"
          className="button button-secondary"
          aria-expanded={aberto}
          onClick={() => setAberto((atual) => !atual)}
        >
          {aberto ? 'Fechar seleção' : 'Selecionar sprints'}
        </button>
        {selecionadas.length > 0 && (
          <button type="button" className="text-button" onClick={onClear}>
            Limpar filtro
          </button>
        )}
      </div>

      {aberto && (
        <div className="kanban-sprint-filter-popover">
          <p className="kanban-sprint-filter-title">
            Exibir tarefas somente das sprints selecionadas
          </p>
          {sprints.length === 0 ? (
            <p className="empty-state">Nenhuma sprint cadastrada.</p>
          ) : (
            <ul className="sprint-tasks-options">
              {sprints.map((sprint) => (
                <li key={sprint.id}>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(sprint.id)}
                      onChange={() => onToggle(sprint.id)}
                    />
                    {/* O espaco explicito nao e cosmetico: sem ele o JSX cola os
                        dois nos, e o nome acessivel da caixa vira
                        "Sprint 3· Concluída" — a margem do CSS so conserta o
                        visual. */}
                    <span>
                      {sprint.name}{' '}
                      <span className="checkbox-field-hint kanban-sprint-filter-hint">
                        · {statusLabels[sprint.id]}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
