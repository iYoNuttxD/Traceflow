import { Link } from 'react-router';
import './TaskCorrectionContext.css';
const labels = {
  ABERTO: 'Aberto',
  EM_CORRECAO: 'Em correção',
  AGUARDANDO_RETESTE: 'Aguardando reteste',
  VALIDADO: 'Validado'
};
function DefectLink({ defect, projectId, onNavigate }) {
  return defect.deletedAt ? (
    <span>DEF-{defect.id} · Excluído (histórico preservado)</span>
  ) : (
    <Link to={`/projects/${projectId}/defects?defect=${defect.id}`} onClick={onNavigate}>
      DEF-{defect.id} · {defect.title}
    </Link>
  );
}
export function TaskCorrectionContext({ task, projectId, onNavigate }) {
  if (task.isFrozen || !task.correctionDefectCount) return null;
  return (
    <section className="task-detail-section task-correction-context">
      <h3>Contexto de correção</h3>
      {task.correctionDefects.map((d) => (
        <div key={d.id}>
          <DefectLink defect={d} projectId={projectId} onNavigate={onNavigate} />
          <small>{labels[d.status]}</small>
        </div>
      ))}
    </section>
  );
}
export function TaskCorrectionBadge({ task }) {
  if (task.isFrozen || !task.correctionDefectCount) return null;
  const ds = task.correctionDefects;
  return (
    <div
      className="task-correction-badge"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {ds.length === 1 ? (
        <>
          <span>CORREÇÃO · </span>
          {ds[0].deletedAt ? (
            <span>DEF-{ds[0].id} (excluído)</span>
          ) : (
            <Link
              aria-label={`Abrir DEF-${ds[0].id}`}
              to={`/projects/${task.projectId}/defects?defect=${ds[0].id}`}
            >
              DEF-{ds[0].id}
            </Link>
          )}
        </>
      ) : (
        <details>
          <summary>CORREÇÃO · {task.correctionDefectCount} defeitos</summary>
          {ds.map((d) => (
            <p key={d.id}>
              <DefectLink defect={d} projectId={task.projectId} />
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
