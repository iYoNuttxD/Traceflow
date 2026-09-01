import { Link } from 'react-router';
import { TraceFlowIcon } from './TraceFlowIcon.jsx';
import './BackButton.css';

export function BackButton({ to, onClick, label = 'Voltar', className = '' }) {
  const classes = ['back-button', className].filter(Boolean).join(' ');
  const content = <TraceFlowIcon name="arrowLeft" />;

  if (to) {
    return (
      <Link className={classes} to={to} aria-label={label} title={label}>
        {content}
      </Link>
    );
  }

  return (
    <button className={classes} type="button" onClick={onClick} aria-label={label} title={label}>
      {content}
    </button>
  );
}
