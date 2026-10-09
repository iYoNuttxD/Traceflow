import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SprintBurndownChart } from '../../src/features/schedule/components/SprintBurndownChart.jsx';

const dias = [
  { date: '2026-08-01', ideal: 10, remaining: 10 },
  { date: '2026-08-02', ideal: 7.5, remaining: 7 },
  { date: '2026-08-03', ideal: 5, remaining: 4 },
  { date: '2026-08-04', ideal: 2.5, remaining: null },
  { date: '2026-08-05', ideal: 0, remaining: null }
];

describe('SprintBurndownChart', () => {
  it.each([false, true])(
    'guards unknown estimates even with hasData=%s from an older API',
    (hasData) => {
      const { container } = render(
        <SprintBurndownChart
          burndown={{
            hasData,
            totalPoints: 0,
            historicalState: 'PARTIAL',
            historicalLimitations: ['BURNUP_ESTIMATE_UNKNOWN'],
            days: [{ date: '2026-08-01', ideal: null, remaining: null }]
          }}
        />
      );
      expect(
        screen.getByText(/Dados parciais.*parte das tarefas não possui estimativa/)
      ).toBeVisible();
      expect(screen.queryByText(/a sprint ainda não começou/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    }
  );

  it('fits historical values above the final scope and uses the supplied ideal values', () => {
    const { container } = render(
      <SprintBurndownChart
        burndown={{
          hasData: true,
          totalPoints: 20,
          chartMax: 40,
          days: [
            { date: '2026-08-01', ideal: 20, remaining: 40 },
            { date: '2026-08-02', ideal: 10, remaining: 20 }
          ]
        }}
      />
    );
    expect(container.querySelector('svg').outerHTML).not.toMatch(/NaN|Infinity/);
    for (const node of container.querySelectorAll('polyline')) {
      for (const point of node.getAttribute('points').split(' ')) {
        const y = Number(point.split(',')[1]);
        expect(y).toBeGreaterThanOrEqual(26);
        expect(y).toBeLessThanOrEqual(258);
      }
    }
    expect(container.querySelector('polyline').getAttribute('points')).toBe('60,142 1080,200');
  });

  it('does not bridge unknown measured days', () => {
    const { container } = render(
      <SprintBurndownChart
        burndown={{
          hasData: true,
          totalPoints: 4,
          days: [
            { date: '2026-08-01', ideal: null, remaining: 4 },
            { date: '2026-08-02', ideal: null, remaining: null },
            { date: '2026-08-03', ideal: null, remaining: 2 }
          ]
        }}
      />
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(/referência inicial está indisponível/);
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
  });
  it('sem dados mostra uma frase, nunca um gráfico zerado', () => {
    render(<SprintBurndownChart burndown={{ hasData: false }} />);
    expect(screen.getByText(/Sem tarefas pontuadas nesta sprint/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('representa a sprint iniciada no último dia por pontos, sem coordenadas inválidas', () => {
    const { container } = render(
      <SprintBurndownChart
        burndown={{
          hasData: true,
          totalPoints: 5,
          frozen: true,
          cutoffDate: '2026-09-15',
          days: [{ date: '2026-09-15', ideal: 5, remaining: 5 }]
        }}
      />
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(/Sprint encerrada com 5 de 5/);
    expect(screen.getByText('15/09')).toBeInTheDocument();
    expect(container.querySelectorAll('svg circle')).toHaveLength(2);
    expect(container.querySelector('svg').outerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('o svg é uma imagem nomeada pela nota do dia', () => {
    render(
      <SprintBurndownChart
        burndown={{
          hasData: true,
          totalPoints: 10,
          frozen: false,
          cutoffDate: '2026-08-03',
          days: dias
        }}
      />
    );
    const grafico = screen.getByRole('img', {
      name: 'Restam 4 de 10 pontos. A linha ideal previa 5 para este dia.'
    });
    expect(grafico).toBeInTheDocument();
    expect(
      screen.getByText('Restam 4 de 10 pontos. A linha ideal previa 5 para este dia.')
    ).toBeInTheDocument();
  });

  it('a legenda nomeia as curvas por texto, não só por cor', () => {
    render(
      <SprintBurndownChart
        burndown={{
          hasData: true,
          totalPoints: 10,
          frozen: false,
          cutoffDate: '2026-08-03',
          days: dias
        }}
      />
    );
    expect(screen.getByText('Restante real')).toBeInTheDocument();
    expect(screen.getByText('Linha ideal')).toBeInTheDocument();
  });

  it('marca o eixo em quatro datas', () => {
    const dez = Array.from({ length: 10 }, (_, indice) => ({
      date: `2026-08-${String(indice + 1).padStart(2, '0')}`,
      ideal: Math.round((10 - (indice * 10) / 9) * 10) / 10,
      remaining: indice < 5 ? 10 - indice : null
    }));
    render(
      <SprintBurndownChart
        burndown={{
          hasData: true,
          totalPoints: 10,
          frozen: false,
          cutoffDate: '2026-08-05',
          days: dez
        }}
      />
    );
    for (const data of ['01/08', '04/08', '07/08', '10/08']) {
      expect(screen.getByText(data)).toBeInTheDocument();
    }
  });

  it('sprint encerrada fala no passado e se declara congelada', () => {
    render(
      <SprintBurndownChart
        burndown={{
          hasData: true,
          totalPoints: 10,
          frozen: true,
          cutoffDate: '2026-08-05',
          days: [
            { date: '2026-08-01', ideal: 10, remaining: 10 },
            { date: '2026-08-02', ideal: 7.5, remaining: 7 },
            { date: '2026-08-03', ideal: 5, remaining: 4 },
            { date: '2026-08-04', ideal: 2.5, remaining: 2 },
            { date: '2026-08-05', ideal: 0, remaining: 2 }
          ]
        }}
      />
    );
    expect(
      screen.getByText('Sprint encerrada com 2 de 10 ponto(s) restante(s) — gráfico congelado.')
    ).toBeInTheDocument();
    expect(screen.getByText('fim')).toBeInTheDocument();
    expect(screen.queryByText('hoje')).not.toBeInTheDocument();
  });
});
