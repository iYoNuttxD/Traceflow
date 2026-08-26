// Bateria RF10/RF35 — o burndown (RF35) não tinha nenhum teste de componente.
// O que importa aqui é o que sobra para quem NÃO enxerga o desenho: o svg é
// role="img" com a nota inteira no aria-label, a legenda nomeia as curvas por
// texto, e "sem dados" é uma frase — nunca um eixo zerado fingindo medida.
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
  it('sem dados mostra uma frase, nunca um gráfico zerado', () => {
    render(<SprintBurndownChart burndown={{ hasData: false }} />);
    expect(screen.getByText(/Sem tarefas pontuadas nesta sprint/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
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
    // A nota compara o real com o ideal DO MESMO dia — é ela que o leitor de
    // tela anuncia no lugar das curvas.
    const grafico = screen.getByRole('img', {
      name: 'Restam 4 de 10 pontos. A linha ideal previa 5 para este dia.'
    });
    expect(grafico).toBeInTheDocument();
    // E a mesma frase existe como texto visível para todo mundo.
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
    // O corte congelado se chama "fim", não "hoje": a sprint não envelhece.
    expect(screen.getByText('fim')).toBeInTheDocument();
    expect(screen.queryByText('hoje')).not.toBeInTheDocument();
  });
});
