import { useEffect } from 'react';
import { ConfirmProvider, useConfirm } from 'traceflow';

// The dialog has no standalone export: it only exists while a useConfirm()
// promise is pending. Opening it on mount is the only way to render it
// statically.
function OpensOnMount({ options, label }) {
  const confirm = useConfirm();
  useEffect(() => {
    void confirm(options);
  }, [confirm]);
  return (
    <main className="page-container">
      <button type="button" className="button button-danger">
        {label}
      </button>
    </main>
  );
}

export const Destructive = () => (
  <ConfirmProvider>
    <OpensOnMount
      label="Excluir tarefa"
      options={{
        title: 'Excluir tarefa',
        description: '"Implementar matriz de rastreabilidade" será removida permanentemente.',
        confirmLabel: 'Excluir'
      }}
    />
  </ConfirmProvider>
);

export const Neutral = () => (
  <ConfirmProvider>
    <OpensOnMount
      label="Encerrar sprint"
      options={{
        title: 'Encerrar sprint',
        description: 'A Sprint 4 será encerrada e as tarefas não concluídas voltarão para o backlog.',
        confirmLabel: 'Encerrar',
        destructive: false
      }}
    />
  </ConfirmProvider>
);
