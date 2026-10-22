// Envelope da mensagem com o PDF pronto. O canal da worker não é exclusivo: em
// `node --watch` o próprio Node envia por ele `{ "watch:import": [...] }` com os
// arquivos carregados, então só uma mensagem com este tipo conta como resultado.
export const REPORT_PDF_MESSAGE = 'traceflow:report-pdf';
