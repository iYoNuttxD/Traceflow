import { useEffect, useRef, useState } from 'react';
import { resumableUploadsApi } from '../api/resumable-uploads.api.js';
const key = (id) => `traceflow.execution-upload.${id}`;
function remembered(id) {
  try {
    const data = JSON.parse(sessionStorage.getItem(key(id)) || 'null');
    return data && /^[0-9a-f-]{36}$/.test(data.idempotencyKey || '') ? data : {};
  } catch {
    return {};
  }
}
export function useExecutionUpload(id) {
  const operation = useRef(remembered(id));
  const controller = useRef(null);
  const generation = useRef(0);
  const [state, setState] = useState(null);
  const [pending, setPending] = useState([]);
  const [message, setMessage] = useState('');
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [id]
  );
  const remember = (value) => {
    operation.current = value || {};
    try {
      if (value)
        sessionStorage.setItem(
          key(id),
          JSON.stringify({ idempotencyKey: value.idempotencyKey, uploadId: value.uploadId })
        );
      else sessionStorage.removeItem(key(id));
    } catch {
      /* Resume still works while this view owns the File objects. */
    }
  };
  return {
    state,
    pending,
    message,
    options() {
      controller.current?.abort();
      controller.current = new AbortController();
      const current = ++generation.current;
      return {
        signal: controller.current.signal,
        operation: operation.current,
        onSession: (value) => {
          if (current === generation.current) remember(value);
        },
        onProgress: (value) => {
          if (current === generation.current) setState(value);
        }
      };
    },
    pause() {
      controller.current?.abort();
    },
    async cancel() {
      controller.current?.abort();
      const current = ++generation.current;
      try {
        if (operation.current.uploadId)
          await resumableUploadsApi.cancel(id, operation.current.uploadId);
        if (current !== generation.current) return;
        remember(null);
        setState(null);
        setPending([]);
        setMessage('Envio cancelado. Seu rascunho foi preservado.');
      } catch (error) {
        if (current !== generation.current) return;
        if ([404, 410].includes(error.response?.status)) {
          remember(null);
          setState(null);
        }
        setMessage(
          error.response?.data?.message ||
            'Não foi possível confirmar o cancelamento. Consulte o progresso antes de iniciar outro envio.'
        );
      }
    },
    async discover() {
      const current = generation.current;
      try {
        const rows = await resumableUploadsApi.list(id);
        if (current !== generation.current) return;
        const active = rows.filter(
          (row) =>
            ['OPEN', 'FINALIZING'].includes(row.sessionStatus) &&
            new Date(row.expiresAt) > new Date()
        );
        setPending(active);
        setMessage(
          active.length
            ? 'Selecione o envio e os arquivos originais para retomar. Preencha novamente os dados da execução.'
            : 'Não há envios pendentes. Consulte o histórico se uma confirmação perdeu a resposta.'
        );
      } catch {
        if (current === generation.current)
          setMessage('Não foi possível consultar envios pendentes.');
      }
    },
    select(row) {
      remember({ idempotencyKey: crypto.randomUUID(), uploadId: row.uploadId });
      setState({
        ...row,
        phase: 'PAUSED',
        message:
          'Envio selecionado. Selecione novamente todos os arquivos originais e confirme os dados.'
      });
      setPending([]);
    }
  };
}
