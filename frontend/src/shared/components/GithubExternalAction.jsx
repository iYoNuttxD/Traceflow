import { TraceFlowIcon } from './TraceFlowIcon.jsx';
import './GithubExternalAction.css';

export function GithubExternalAction({ href, ariaLabel }) {
  return (
    <a
      className="button button-compact task-detail-external-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
    >
      Abrir no GitHub
      <TraceFlowIcon name="externalLink" />
    </a>
  );
}
