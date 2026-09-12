import { useEffect, useState } from 'react';
import { SprintActionsMenu } from '../../schedule/index.js';

export function DefectHeaderActions({ defect, busy, onView }) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return (
    <>
      {defect.status === 'AGUARDANDO_RETESTE' && (
        <button
          className="button button-primary button-compact"
          disabled={busy}
          onClick={() => onView('retest')}
        >
          Retestar
        </button>
      )}
      {compact ? (
        <SprintActionsMenu
          entityName={defect.displayId}
          entityDescriptor="do defeito"
          disabled={busy}
          items={[
            { key: 'edit', label: 'Editar', onSelect: () => onView('edit') },
            {
              key: 'delete',
              label: 'Excluir defeito',
              danger: true,
              onSelect: () => onView('delete')
            }
          ]}
        />
      ) : (
        <>
          <button
            className="button button-secondary button-compact"
            disabled={busy}
            onClick={() => onView('edit')}
          >
            Editar
          </button>
          <button
            className="button button-danger button-compact"
            data-delete-defect
            disabled={busy}
            onClick={() => onView('delete')}
          >
            Excluir
          </button>
        </>
      )}
    </>
  );
}
