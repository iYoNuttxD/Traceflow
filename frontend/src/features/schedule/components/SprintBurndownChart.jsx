import { shortDate } from './schedule-calendar.js';

const ESQUERDA = 46;
const DIREITA = 544;
const TOPO = 18;
const BASE = 180;

const arredonda = (valor) => Math.round(valor * 10) / 10;

export function SprintBurndownChart({ burndown }) {
  if (!burndown?.hasData) {
    return (
      <p className="field-help">
        Sem tarefas pontuadas nesta sprint — o burndown aparece quando houver tarefas associadas com
        estimativa.
      </p>
    );
  }

  const { days, totalPoints, frozen, cutoffDate } = burndown;
  const ultimo = days.length - 1;
  const x = (indice) => arredonda(ESQUERDA + (indice * (DIREITA - ESQUERDA)) / ultimo);
  const y = (valor) => arredonda(TOPO + (1 - valor / totalPoints) * (BASE - TOPO));

  const ideal = `${x(0)},${y(totalPoints)} ${x(ultimo)},${y(0)}`;
  const medidos = days
    .map((dia, indice) => ({ ...dia, indice }))
    .filter((dia) => dia.remaining !== null);
  const real = medidos.map((dia) => `${x(dia.indice)},${y(dia.remaining)}`).join(' ');
  const ponta = medidos[medidos.length - 1] || null;
  const indiceCorte = cutoffDate ? days.findIndex((dia) => dia.date === cutoffDate) : -1;

  const marcas = [...new Set([0, Math.floor(ultimo / 2), ultimo])];

  const restante = ponta ? ponta.remaining : totalPoints;
  const esperado = ponta ? days[ponta.indice].ideal : totalPoints;
  const nota = frozen
    ? `Sprint encerrada com ${restante} de ${totalPoints} ponto(s) restante(s) — gráfico congelado.`
    : ponta
      ? `Restam ${restante} de ${totalPoints} pontos. A linha ideal previa ${esperado} para este dia.`
      : 'A sprint ainda não começou — a linha real aparece a partir do início.';

  return (
    <div>
      <h4 className="burndown-title">Burndown</h4>
      <p className="burndown-legend">
        <span>
          <span className="burndown-swatch burndown-swatch--real" aria-hidden="true" />
          Restante real
        </span>
        <span>
          <span className="burndown-swatch burndown-swatch--ideal" aria-hidden="true" />
          Linha ideal
        </span>
      </p>
      <svg viewBox="0 0 560 210" className="burndown-chart" role="img" aria-label={nota}>
        <line x1={ESQUERDA} y1={TOPO} x2={ESQUERDA} y2={BASE} stroke="#e2e7f0" strokeWidth="1.5" />
        <line x1={ESQUERDA} y1={BASE} x2={DIREITA} y2={BASE} stroke="#e2e7f0" strokeWidth="1.5" />
        <text x={ESQUERDA - 6} y={TOPO + 5} fill="#667085" fontSize="11" textAnchor="end">
          {totalPoints}
        </text>
        <text x={ESQUERDA - 6} y={BASE + 4} fill="#667085" fontSize="11" textAnchor="end">
          0
        </text>
        {indiceCorte >= 0 && (
          <>
            <line
              x1={x(indiceCorte)}
              y1={TOPO}
              x2={x(indiceCorte)}
              y2={BASE}
              stroke="#98a2b3"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text x={x(indiceCorte)} y="12" fill="#667085" fontSize="10" textAnchor="middle">
              {frozen ? 'fim' : 'hoje'}
            </text>
          </>
        )}
        <polyline
          points={ideal}
          fill="none"
          stroke="#98a2b3"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        {real && <polyline points={real} fill="none" stroke="#315bce" strokeWidth="2.5" />}
        {ponta && <circle cx={x(ponta.indice)} cy={y(ponta.remaining)} r="4.5" fill="#315bce" />}
        {marcas.map((indice) => (
          <text key={indice} x={x(indice)} y="198" fill="#667085" fontSize="11" textAnchor="middle">
            {shortDate(days[indice].date)}
          </text>
        ))}
      </svg>
      <p className="field-help">{nota}</p>
    </div>
  );
}
