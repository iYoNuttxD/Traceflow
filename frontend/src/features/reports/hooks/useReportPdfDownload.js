import { useCallback, useRef, useState } from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { reportsApi } from '../api/reports.api.js';
import { reportPdfFilename } from '../model/report-file.js';

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useReportPdfDownload(projectId, projectName) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState(null);
  const lock = useRef(false);

  const download = useCallback(
    async (reportId) => {
      if (lock.current) return;
      lock.current = true;
      setDownloadingId(reportId);
      setError(null);
      try {
        const blob = await reportsApi.downloadPdf(projectId, reportId);
        saveBlob(blob, reportPdfFilename(reportId, projectName));
      } catch (value) {
        setError(normalizeApiError(value, 'Não foi possível baixar o PDF do relatório.'));
      } finally {
        lock.current = false;
        setDownloadingId(null);
      }
    },
    [projectId, projectName]
  );

  return { download, downloadingId, error };
}
