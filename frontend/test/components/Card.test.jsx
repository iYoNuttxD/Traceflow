import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from '../../src/components/Card.jsx';

describe('Card', () => {
  it('renderiza o título e o conteúdo atuais', () => {
    render(
      <Card title="Título artificial">
        <p>Conteúdo artificial</p>
      </Card>
    );

    expect(screen.getByRole('heading', { name: 'Título artificial' })).toBeInTheDocument();
    expect(screen.getByText('Conteúdo artificial')).toBeInTheDocument();
  });

  it('não cria heading quando o título não é informado', () => {
    render(<Card>Conteúdo sem título</Card>);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Conteúdo sem título')).toBeInTheDocument();
  });
});
