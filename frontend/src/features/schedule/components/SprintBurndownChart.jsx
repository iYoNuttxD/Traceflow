import { shortDate } from './schedule-calendar.js';

const CAIXA = '0 0 1100 300';
const ESQUERDA = 60;
const DIREITA = 1080;
const TOPO = 26;
const BASE = 258;
const FONTE = 13;
const FONTE_CORTE = 12;
const CORTE_Y = 18;
const MARCAS_Y = 284;
const RAIO = 5;

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

  const marcas = [...new Set([0, Math.round(ultimo / 3), Math.round((2 * ultimo) / 3), ultimo])];

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
      <svg viewBox={CAIXA} className="burndown-chart" role="img" aria-label={nota}>
        <line
          x1={ESQUERDA}
          y1={TOPO}
          x2={ESQUERDA}
          y2={BASE}
          stroke="var(--color-border-default)"
          strokeWidth="1.5"
        />
        <line
          x1={ESQUERDA}
          y1={BASE}
          x2={DIREITA}
          y2={BASE}
          stroke="var(--color-border-default)"
          strokeWidth="1.5"
        />
        <text
          x={ESQUERDA - 6}
          y={TOPO + 5}
          fill="var(--color-text-secondary)"
          fontSize={FONTE}
          textAnchor="end"
        >
          {totalPoints}
        </text>
        <text
          x={ESQUERDA - 6}
          y={BASE + 4}
          fill="var(--color-text-secondary)"
          fontSize={FONTE}
          textAnchor="end"
        >
          0
        </text>
        {indiceCorte >= 0 && (
          <>
            <line
              x1={x(indiceCorte)}
              y1={TOPO}
              x2={x(indiceCorte)}
              y2={BASE}
              stroke="var(--color-text-muted)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text
              x={x(indiceCorte)}
              y={CORTE_Y}
              fill="var(--color-text-secondary)"
              fontSize={FONTE_CORTE}
              textAnchor="middle"
            >
              {frozen ? 'fim' : 'hoje'}
            </text>
          </>
        )}
        <polyline
          points={ideal}
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth="2"
          strokeDasharray="6 6"
        />
        {real && (
          <polyline
            points={real}
            fill="none"
            stroke="var(--color-accent-primary)"
            strokeWidth="2.5"
          />
        )}
        {ponta && (
          <circle
            cx={x(ponta.indice)}
            cy={y(ponta.remaining)}
            r={RAIO}
            fill="var(--color-accent-primary)"
          />
        )}
        {marcas.map((indice) => (
          <text
            key={indice}
            x={x(indice)}
            y={MARCAS_Y}
            fill="var(--color-text-secondary)"
            fontSize={FONTE}
            textAnchor={indice === 0 ? 'start' : indice === ultimo ? 'end' : 'middle'}
          >
            {shortDate(days[indice].date)}
          </text>
        ))}
      </svg>
      <p className="field-help">{nota}</p>
    </div>
  );
}
