import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchCombobox } from '../../src/features/schedule/components/SearchCombobox.jsx';

const options = [
  { id: 1, title: 'Marco inicial' },
  { id: 2, title: 'Entrega final' }
];
const label = (option) => option.title;

describe('SearchCombobox', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('aguarda dois caracteres e aplica debounce antes de pesquisar', async () => {
    const search = vi.fn().mockResolvedValue(options);
    render(
      <SearchCombobox
        label="Marco"
        placeholder="Pesquisar marco..."
        onSearch={search}
        onSelect={vi.fn()}
        getOptionLabel={label}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Marco' }), { target: { value: 'm' } });
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(search).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Marco' }), { target: { value: 'ma' } });
    expect(screen.getByRole('status')).toHaveTextContent('Pesquisando...');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(search).toHaveBeenCalledWith('ma', expect.any(AbortSignal));
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('seleciona o resultado ativo com teclado', async () => {
    const onSelect = vi.fn();
    render(
      <SearchCombobox label="Marco" options={options} onSelect={onSelect} getOptionLabel={label} />
    );

    const input = screen.getByRole('combobox', { name: 'Marco' });
    fireEvent.change(input, { target: { value: 'ma' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(options[0]);
  });

  it('informa resultado vazio', async () => {
    render(
      <SearchCombobox label="Marco" options={options} onSelect={vi.fn()} getOptionLabel={label} />
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Marco' }), {
      target: { value: 'inexistente' }
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByText('Nenhum resultado encontrado.')).toBeInTheDocument();
  });

  it('ignora resposta antiga que chega depois da consulta atual', async () => {
    let resolveOld;
    let resolveCurrent;
    const search = vi.fn((query) => {
      if (query === 'log') return new Promise((resolve) => (resolveOld = resolve));
      return new Promise((resolve) => (resolveCurrent = resolve));
    });
    render(
      <SearchCombobox label="Tarefa" onSearch={search} onSelect={vi.fn()} getOptionLabel={label} />
    );
    const input = screen.getByRole('combobox', { name: 'Tarefa' });

    fireEvent.change(input, { target: { value: 'log' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.change(input, { target: { value: 'login' } });
    await act(() => vi.advanceTimersByTimeAsync(300));

    await act(async () => resolveCurrent([{ id: 2, title: 'Login atual' }]));
    expect(screen.getByRole('option', { name: 'Login atual' })).toBeInTheDocument();
    await act(async () => resolveOld([{ id: 1, title: 'Log antigo' }]));
    expect(screen.queryByText('Log antigo')).not.toBeInTheDocument();
    expect(screen.getByText('Login atual')).toBeInTheDocument();
  });

  it('fecha resultados no Escape sem limpar a consulta', async () => {
    render(
      <SearchCombobox label="Marco" options={options} onSelect={vi.fn()} getOptionLabel={label} />
    );
    const input = screen.getByRole('combobox', { name: 'Marco' });
    fireEvent.change(input, { target: { value: 'ma' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('ma');
  });

  it('mostra e remove a seleção atual', async () => {
    vi.useRealTimers();
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchCombobox
        label="Marco"
        selectedOption={options[0]}
        onSelect={vi.fn()}
        onClear={onClear}
        getOptionLabel={label}
      />
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover Marco inicial' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
