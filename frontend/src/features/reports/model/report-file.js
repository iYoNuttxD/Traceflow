// Mesmo nome de arquivo que o backend envia no Content-Disposition (report.service.js):
// só ASCII, com o nome do projeto sem acentos. A paridade é testada no backend.
export function reportPdfFilename(reportId, projectName) {
  const slug =
    String(projectName ?? '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60)
      .replace(/^-+|-+$/g, '') || 'projeto';
  return `traceflow-relatorio-${reportId}-${slug}.pdf`;
}
