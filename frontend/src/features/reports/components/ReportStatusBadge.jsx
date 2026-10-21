import { reportStatus } from '../model/report-display.js';

export function ReportStatusBadge({ status }) {
  const { label, tone } = reportStatus(status);
  return (
    <span className={`report-badge report-badge--${tone}`}>
      {['QUEUED', 'RUNNING'].includes(status) && (
        <span className="report-badge__pulse" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
