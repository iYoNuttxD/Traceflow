import './TaskMetrics.css';

export function TaskMetrics({ tasks }) {
  const metrics = [
    ['Total', tasks.length],
    ['A fazer', tasks.filter((task) => task.status === 'A_FAZER').length],
    ['Em andamento', tasks.filter((task) => task.status === 'EM_ANDAMENTO').length],
    ['Concluídas', tasks.filter((task) => task.status === 'CONCLUIDO').length],
    [
      'Com responsável',
      tasks.filter((task) => task.responsibleUserId || task.responsibleUser || task.responsible)
        .length
    ],
    [
      'Com estimativa',
      tasks.filter((task) => task.estimatedEffort !== null && task.estimatedEffort !== undefined)
        .length
    ]
  ];

  return (
    <section className="tasks-overview" aria-labelledby="tasks-summary-title">
      <header>
        <div>
          <span className="eyebrow">Resumo</span>
          <h2 id="tasks-summary-title">Visão geral das tarefas</h2>
        </div>
        <p>Acompanhe a organização atual das atividades do projeto.</p>
      </header>
      <dl>
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
