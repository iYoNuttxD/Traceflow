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
  const days = Array.isArray(burndown?.days)
    ? burndown.days.filter((day) => !Number.isNaN(Date.parse(day.date)))
    : [];
  const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const scaleValues = days.flatMap((day) => [day.remaining, day.ideal]).filter(finite);
  const chartMax = Math.max(
    0,
    ...(finite(burndown?.chartMax) ? [burndown.chartMax] : []),
    ...scaleValues
  );
  const limitations = burndown?.historicalLimitations ?? [];
  const estimateMissing = limitations.some((code) =>
    ['TASK_ESTIMATE_MISSING', 'BURNUP_ESTIMATE_UNKNOWN'].includes(code)
  );
  if (!burndown?.hasData || chartMax <= 0 || !scaleValues.length) {
    return (
      <p className="field-help">
        {estimateMissing || burndown?.historicalState === 'PARTIAL'
          ? 'Dados parciais. Não é possível calcular completamente o Burndown porque parte das tarefas não possui estimativa ou o histórico está incompleto.'
          : 'Sem tarefas pontuadas nesta sprint — o burndown aparece quando houver tarefas associadas com estimativa.'}
      </p>
    );
  }

  const { totalPoints, frozen, cutoffDate } = burndown;
  const baselineKnown = finite(totalPoints);
  const ultimo = days.length - 1;
  const x = (indice) =>
    ultimo === 0
      ? arredonda((ESQUERDA + DIREITA) / 2)
      : arredonda(ESQUERDA + (indice * (DIREITA - ESQUERDA)) / ultimo);
  const y = (valor) => arredonda(TOPO + (1 - valor / chartMax) * (BASE - TOPO));

  const ideais = days.map((dia, indice) => ({ ...dia, indice })).filter((dia) => finite(dia.ideal));
  const ideal = ideais.map((dia) => `${x(dia.indice)},${y(dia.ideal)}`).join(' ');
  const medidos = days
    .map((dia, indice) => ({ ...dia, indice }))
    .filter((dia) => finite(dia.remaining));
  const segmentos = [];
  for (const dia of medidos) {
    if (!segmentos.length || dia.indice !== segmentos.at(-1).at(-1).indice + 1) segmentos.push([]);
    segmentos.at(-1).push(dia);
  }
  const ponta = medidos[medidos.length - 1] || null;
  const indiceCorte = cutoffDate ? days.findIndex((dia) => dia.date === cutoffDate) : -1;

  const marcas = [...new Set([0, Math.round(ultimo / 3), Math.round((2 * ultimo) / 3), ultimo])];

  const restante = ponta ? ponta.remaining : totalPoints;
  const esperado = ponta ? days[ponta.indice].ideal : totalPoints;
  const nota = frozen
    ? `Sprint encerrada com ${restante}${baselineKnown ? ` de ${totalPoints}` : ''} ponto(s) restante(s) — gráfico congelado.`
    : ponta
      ? `Restam ${restante}${baselineKnown ? ` de ${totalPoints}` : ''} pontos.${finite(esperado) ? ` A linha ideal previa ${esperado} para este dia.` : ' A referência inicial está indisponível.'}`
      : estimateMissing
        ? 'Dados parciais: o trabalho restante é desconhecido porque há tarefas sem estimativa.'
        : 'Ainda não há medições de trabalho restante disponíveis.';

  return (
    <div>
      <h4 className="burndown-title">Burndown</h4>
      <p className="burndown-legend">
        <span>
          <span className="burndown-swatch burndown-swatch--real" aria-hidden="true" />
          Restante real
        </span>
        {ideal && (
          <span>
            <span className="burndown-swatch burndown-swatch--ideal" aria-hidden="true" />
            Linha ideal
          </span>
        )}
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
          {chartMax}
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
        {ideal &&
          (ultimo === 0 ? (
            <circle cx={x(0)} cy={y(ideais[0].ideal)} r={RAIO} fill="var(--color-text-muted)" />
          ) : (
            <polyline
              points={ideal}
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="2"
              strokeDasharray="6 6"
            />
          ))}
        {segmentos
          .filter((segmento) => segmento.length > 1)
          .map((segmento) => (
            <polyline
              key={segmento[0].indice}
              points={segmento.map((dia) => `${x(dia.indice)},${y(dia.remaining)}`).join(' ')}
              fill="none"
              stroke="var(--color-accent-primary)"
              strokeWidth="2.5"
            />
          ))}
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
      {burndown.historicalState === 'PARTIAL' && (
        <p className="field-help">
          {estimateMissing
            ? 'Dados parciais: há tarefas sem estimativa em parte do histórico.'
            : 'Histórico parcial; a referência inicial não é presumida.'}
        </p>
      )}
    </div>
  );
}
