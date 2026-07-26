import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAbortableRequest } from '../../src/shared/index.js';

function Fixture() {
  const [value, setValue] = useState('inicial');
  const { run } = useAbortableRequest();
  useEffect(() => {
    void run(() => new Promise((resolve) => setTimeout(() => resolve('antiga'), 25))).then((result) => result && setValue(result));
    void run(() => Promise.resolve('nova')).then((result) => result && setValue(result));
  }, [run]);
  return <output>{value}</output>;
}

describe('useAbortableRequest', () => {
  it('impede resposta obsoleta de sobrescrever a consulta atual', async () => {
    render(<Fixture />);
    expect(await screen.findByText('nova')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(screen.getByText('nova')).toBeInTheDocument();
  });
});
