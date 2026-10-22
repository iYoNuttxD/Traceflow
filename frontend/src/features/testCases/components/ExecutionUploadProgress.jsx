export function ExecutionUploadProgress({ upload, busy }) {
  const { state, pending, message } = upload;
  const active = ['HASHING', 'UPLOADING', 'FINALIZING'].includes(state?.phase);
  const percent =
    state?.phase === 'COMPLETE'
      ? 100
      : Math.min(99, Math.floor((100 * (state?.confirmedBytes || 0)) / (state?.totalBytes || 1)));
  const phases = {
    HASHING: 'Verificando arquivos',
    UPLOADING: 'Enviando evidências',
    FINALIZING: 'Confirmando execução',
    PAUSED: 'Envio interrompido',
    ERROR: 'Envio não concluído',
    COMPLETE: 'Execução confirmada'
  };
  return (
    <section className="tc-surface tc-upload-progress" aria-label="Envio de evidências">
      {state && (
        <>
          <p role="status" aria-live="polite">
            {phases[state.phase]}
            {state.retry
              ? ` · Nova tentativa ${state.retry} em ${Math.ceil(state.retryDelayMs / 1000)} s`
              : ''}
          </p>
          <progress aria-label="Progresso confirmado das evidências" value={percent} max="100" />
          <p className="field-help">
            {percent}% · {((state.confirmedBytes || 0) / 1048576).toFixed(1)} de{' '}
            {((state.totalBytes || 0) / 1048576).toFixed(1)} MiB confirmados pelo servidor. A
            execução só é registrada após a confirmação final.
          </p>
          {state.files?.length > 0 && (
            <ul>
              {state.files.map((file) => (
                <li key={file.id}>
                  {file.name} · {file.receivedParts?.length || 0} de{' '}
                  {Math.ceil(file.sizeBytes / 8388608)} partes confirmadas
                </li>
              ))}
            </ul>
          )}
          {state.message && (
            <p role={state.phase === 'ERROR' ? 'alert' : 'status'}>{state.message}</p>
          )}
          {active && busy && (
            <button type="button" className="button button-secondary" onClick={upload.pause}>
              Interromper envio
            </button>
          )}
          {!busy && ['PAUSED', 'ERROR'].includes(state.phase) && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void upload.cancel()}
            >
              Cancelar envio pendente
            </button>
          )}
        </>
      )}
      {!busy && (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => void upload.discover()}
        >
          Consultar envios pendentes
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {pending.map((row) => (
        <button
          key={row.uploadId}
          type="button"
          className="button button-secondary"
          onClick={() => upload.select(row)}
        >
          Retomar envio de {row.files.length} arquivo(s), caso v{row.testCaseVersion}
        </button>
      ))}
      <p className="field-help">
        Após reabrir esta página, selecione os arquivos originais para retomar. O navegador não
        guarda cópias dos arquivos.
      </p>
    </section>
  );
}
