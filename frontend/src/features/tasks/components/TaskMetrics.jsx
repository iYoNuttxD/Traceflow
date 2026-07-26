import { Card } from '../../../shared/index.js';

function CoverageMetric({ title, coverage, emptyDescription, linkedDescription }) {
  return (
    <Card title={title}>
      <strong className="metric-value">{coverage?.coveragePercentage ?? 0}%</strong>
      <p className="metric-description">
        {coverage ? linkedDescription(coverage) : emptyDescription}
      </p>
    </Card>
  );
}

export function TaskMetrics({ total, pullRequestCoverage, commitCoverage, issueCoverage }) {
  return (
    <div className="task-summary">
      <Card title="Total de tarefas cadastradas">
        <strong className="metric-value">{total}</strong>
      </Card>
      <CoverageMetric
        title="Cobertura com Pull Requests"
        coverage={pullRequestCoverage}
        emptyDescription="Percentual de tarefas vinculadas a pull requests."
        linkedDescription={(value) =>
          `${value.linkedTasks} de ${value.totalTasks} tarefas possuem PR vinculado.`
        }
      />
      <CoverageMetric
        title="Cobertura com commits"
        coverage={commitCoverage}
        emptyDescription="Percentual de tarefas vinculadas a commits."
        linkedDescription={(value) =>
          `${value.linkedTasks} de ${value.totalTasks} tarefas possuem pelo menos um commit vinculado.`
        }
      />
      <CoverageMetric
        title="Cobertura com issues"
        coverage={issueCoverage}
        emptyDescription="Percentual de tarefas vinculadas a issues."
        linkedDescription={(value) =>
          `${value.linkedTasks} de ${value.totalTasks} tarefas possuem pelo menos uma issue vinculada.`
        }
      />
    </div>
  );
}
