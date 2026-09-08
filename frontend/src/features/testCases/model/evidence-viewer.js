export const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;

// Deliberately closed MIME allowlist: filenames never opt HTML/SVG into a renderer.
export function evidenceKind(mimeType) {
  const mime = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return 'image';
  if (['video/mp4', 'video/webm', 'video/quicktime'].includes(mime)) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/plain') return 'text';
  if (mime === 'application/json') return 'json';
  return 'unsupported';
}

export function evidenceSize(bytes) {
  if (bytes < 1024) return `${bytes.toLocaleString('pt-BR')} bytes`;
  const unit = bytes < 1024 * 1024 ? 'KB' : 'MB';
  return `${(bytes / (unit === 'KB' ? 1024 : 1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unit}`;
}

export function evidenceDescription(file) {
  const labels = {
    image: 'Imagem',
    video: 'Vídeo',
    pdf: 'PDF',
    text: 'Texto',
    json: 'JSON',
    unsupported: 'Arquivo'
  };
  return `${labels[evidenceKind(file.mimeType)]} · ${evidenceSize(file.sizeBytes)}`;
}

export function previewUnavailable(file) {
  const kind = evidenceKind(file.mimeType);
  if (kind === 'unsupported') return 'Visualização não disponível para este formato.';
  if (['text', 'json'].includes(kind) && file.sizeBytes > TEXT_PREVIEW_LIMIT)
    return `Este arquivo é grande demais para visualização direta no TRACEFLOW. Tamanho: ${evidenceSize(file.sizeBytes)}.`;
  return '';
}
