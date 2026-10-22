import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import pdfmake from 'pdfmake';
import { buildReportPdfDefinition } from './report-pdf.document.js';

const require = createRequire(import.meta.url);

const FONTS_DIR = join(dirname(require.resolve('pdfmake/package.json')), 'fonts', 'Roboto');
const FONT_FILES = Object.freeze({
  normal: join(FONTS_DIR, 'Roboto-Regular.ttf'),
  bold: join(FONTS_DIR, 'Roboto-Medium.ttf'),
  italics: join(FONTS_DIR, 'Roboto-Italic.ttf'),
  bolditalics: join(FONTS_DIR, 'Roboto-MediumItalic.ttf')
});
const ALLOWED_FILES = new Set(Object.values(FONT_FILES).map((file) => resolve(file)));

let configured = false;

// O PDF usa só as fontes Roboto distribuídas com o pdfmake (com acentuação do
// português). Nenhuma URL é baixada e nenhum outro arquivo local pode ser lido, mesmo
// que um texto do projeto tente referenciar um recurso.
function configurePdfmake() {
  if (configured) return;
  pdfmake.setFonts({ Roboto: { ...FONT_FILES } });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((file) => ALLOWED_FILES.has(resolve(file)));
  configured = true;
}

export async function renderReportPdf(report, options = {}) {
  configurePdfmake();
  return pdfmake.createPdf(buildReportPdfDefinition(report, options)).getBuffer();
}
