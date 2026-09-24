import { TraceFlowIcon } from './TraceFlowIcon.jsx';
import './GithubExternalAction.css';

export function GithubExternalAction({ href }) {
  return (
    <a
      className="button button-compact task-detail-external-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      Abrir no GitHub
      <TraceFlowIcon name="externalLink" />
    </a>
  );
}
