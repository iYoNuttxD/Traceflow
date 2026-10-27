import { useEffect, useState } from 'react';
import { SprintActionsMenu } from '../../schedule/index.js';

export function TestCaseHeaderActions({ testCase, canWrite, onView, onDelete, deleteTriggerRef }) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  if (!canWrite) return null;
  return (
    <>
      {testCase.capabilities.canEdit && (
        <>
          <button
            className="button button-primary button-compact"
            disabled={!testCase.capabilities.canExecute}
            onClick={() => onView('execute')}
          >
            Executar
          </button>
          <button className="button button-secondary button-compact" onClick={() => onView('edit')}>
            Editar
          </button>
        </>
      )}
      {testCase.capabilities.canDelete &&
        (compact ? (
          <SprintActionsMenu
            triggerRef={deleteTriggerRef}
            entityName={testCase.displayId}
            entityDescriptor="do caso"
            items={[
              {
                key: 'delete',
                label: 'Excluir caso',
                danger: true,
                onSelect: (trigger) => onDelete({ currentTarget: trigger })
              }
            ]}
          />
        ) : (
          <button
            className="button button-danger button-compact"
            ref={deleteTriggerRef}
            onClick={onDelete}
          >
            Excluir caso
          </button>
        ))}
    </>
  );
}
