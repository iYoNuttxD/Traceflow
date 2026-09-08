import { useEffect, useState } from 'react';
import { SprintActionsMenu } from '../../schedule/index.js';

export function TestCaseHeaderActions({ testCase, canWrite, onView, onDelete }) {
  const [compact, setCompact] = useState(false);
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
            data-delete-case
            onClick={onDelete}
          >
            Excluir caso
          </button>
        ))}
    </>
  );
}
