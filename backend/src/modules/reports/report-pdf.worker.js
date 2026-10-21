import { parentPort, workerData } from 'node:worker_threads';
import { REPORT_PDF_MESSAGE } from './report-pdf.message.js';
import { renderReportPdf } from './report-pdf.renderer.js';

// Executa fora da thread principal: a montagem do PDF é síncrona e não pode travar a API.
const pdf = await renderReportPdf(workerData.report, workerData.options);
parentPort.postMessage({ type: REPORT_PDF_MESSAGE, pdf });
