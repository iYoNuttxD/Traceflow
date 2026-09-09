import { Link } from 'react-router';
import { TraceFlowIcon } from './TraceFlowIcon.jsx';
import './EntityRow.css';

export function EntityRow({ identity, title, children, to, onClick, disabled = false }) {
  const content = (
    <>
      <span className="entity-row__content">
        <strong>
          {identity}
          {title ? ` · ${title}` : ''}
        </strong>
        {children && <span className="entity-row__metadata">{children}</span>}
      </span>
      {!disabled && <TraceFlowIcon name="arrowRight" />}
    </>
  );
  if (disabled) return <div className="entity-row entity-row--static">{content}</div>;
  return to ? (
    <Link
      className="entity-row"
      aria-label={`${identity}${title ? ` · ${title}` : ''}`}
      to={to}
      onClick={onClick}
    >
      {content}
    </Link>
  ) : (
    <button
      type="button"
      className="entity-row"
      aria-label={`${identity}${title ? ` · ${title}` : ''}`}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
