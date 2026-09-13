import { TraceFlowIcon } from './TraceFlowIcon.jsx';
import './SelectControl.css';

export function SelectControl({ children, ...props }) {
  return (
    <span className="tc-select">
      <select {...props}>{children}</select>
      <TraceFlowIcon name="arrowRight" />
    </span>
  );
}
