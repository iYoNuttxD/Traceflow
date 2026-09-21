import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SprintDialog } from '../../src/features/schedule/components/SprintDialog.jsx';
import { SearchCombobox } from '../../src/shared/components/SearchCombobox.jsx';

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
    expect(fireEvent.mouseDown(screen.getAllByRole('option')[0])).toBe(false);
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

  it('mantém opções indisponíveis visíveis e as ignora na navegação por teclado', async () => {
    const onSelect = vi.fn();
    render(
      <SearchCombobox
        label="Sprint"
        options={options}
        onSelect={onSelect}
        getOptionLabel={label}
        isOptionDisabled={(option) => option.id === 1}
      />
    );

    const input = screen.getByRole('combobox', { name: 'Sprint' });
    fireEvent.change(input, { target: { value: 'al' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('option', { name: 'Marco inicial' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(options[1]);
  });

  it('mantém a opção ativa visível no scroll interno com setas, Home e End', async () => {
    const manyOptions = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      title: `Opção ${String(index + 1).padStart(2, '0')}`
    }));
    render(
      <SearchCombobox
        label="Tarefa"
        options={manyOptions}
        onSelect={vi.fn()}
        getOptionLabel={label}
        isOptionDisabled={(option) => option.id === 6}
      />
    );

    const input = screen.getByRole('combobox', { name: 'Tarefa' });
    fireEvent.change(input, { target: { value: 'op' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    const renderedOptions = screen.getAllByRole('option');
    const scrollSpies = renderedOptions.map((option) => {
      option.scrollIntoView = vi.fn();
      return option.scrollIntoView;
    });

    fireEvent.keyDown(input, { key: 'End' });
    expect(scrollSpies.at(-1)).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(input).toHaveAttribute('aria-activedescendant', renderedOptions.at(-1).id);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(scrollSpies.at(-2)).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });
    fireEvent.keyDown(input, { key: 'Home' });
    expect(scrollSpies[0]).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(scrollSpies[1]).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(scrollSpies[5]).not.toHaveBeenCalled();
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
  it('keeps opt-in zero-query choices closed on focus and opens with ArrowDown', async () => {
    render(
      <SearchCombobox
        label="Referência"
        minQueryLength={0}
        openOnFocus={false}
        options={options}
        onSelect={vi.fn()}
      />
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Marco' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('option', { name: 'Marco inicial' })).toBeInTheDocument();
  });
  it('portals the list as a fixed overlay and updates its anchor on scroll and resize', async () => {
    render(
      <section>
        <div data-testid="body">
          <SearchCombobox
            label="Referência"
            minQueryLength={0}
            openOnFocus={false}
            options={options}
            onSelect={vi.fn()}
          />
        </div>
      </section>
    );
    const input = screen.getByRole('combobox');
    let triggerRect = {
      left: 100,
      right: 340,
      top: 100,
      bottom: 144,
      width: 240,
      height: 44,
      x: 100,
      y: 100,
      toJSON: () => ({})
    };
    vi.spyOn(input, 'getBoundingClientRect').mockImplementation(() => triggerRect);
    fireEvent.click(input);
    await act(() => vi.advanceTimersByTimeAsync(300));
    let list = screen.getByRole('listbox');
    expect(list.parentElement).toBe(document.body);
    expect(list).toHaveStyle({ left: '100px', top: '148px', width: '240px' });
    expect(list).toHaveAttribute('data-placement', 'below');
    expect(fireEvent.mouseDown(list)).toBe(true);
    expect(fireEvent.mouseDown(screen.getAllByRole('option')[0])).toBe(false);
    fireEvent.scroll(list);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    triggerRect = { ...triggerRect, left: 80, right: 320, x: 80 };
    fireEvent.scroll(screen.getByTestId('body'));
    expect(screen.getByRole('listbox')).toHaveStyle({ left: '80px' });
    fireEvent.click(input);
    await act(() => vi.advanceTimersByTimeAsync(300));
    triggerRect = { ...triggerRect, left: 60, right: 300, x: 60 };
    fireEvent.resize(window);
    expect(screen.getByRole('listbox')).toHaveStyle({ left: '60px' });
    fireEvent.click(input);
    await act(() => vi.advanceTimersByTimeAsync(300));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens above the trigger when the viewport has more space there', async () => {
    render(
      <SearchCombobox
        label="Tarefa relacionada"
        minQueryLength={0}
        openOnFocus={false}
        options={options}
        onSelect={vi.fn()}
      />
    );
    const input = screen.getByRole('combobox');
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 340,
      top: 750,
      bottom: 794,
      width: 240,
      height: 44,
      x: 100,
      y: 750,
      toJSON: () => ({})
    });
    fireEvent.click(input);
    await act(() => vi.advanceTimersByTimeAsync(300));
    const list = screen.getByRole('listbox');
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 180 });
    fireEvent.resize(window);
    expect(list).toHaveAttribute('data-placement', 'above');
    expect(Number.parseFloat(list.style.top)).toBeLessThan(750);
  });

  it('keeps a dialog popover in the modal tree without joining form flow', async () => {
    render(
      <div data-testid="backdrop">
        <section role="dialog">
          <SearchCombobox
            label="Responsável"
            minQueryLength={0}
            openOnFocus={false}
            options={options}
            onSelect={vi.fn()}
          />
        </section>
      </div>
    );
    fireEvent.click(screen.getByRole('combobox'));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('listbox').parentElement).toBe(screen.getByRole('dialog'));
    expect(screen.getByRole('listbox').parentElement).not.toBe(
      screen.getByRole('combobox').parentElement
    );
  });

  it('fecha o popover com Escape sem fechar o diálogo owner', async () => {
    const onClose = vi.fn();
    render(
      <SprintDialog open title="Editar tarefa" onClose={onClose}>
        <SearchCombobox label="Requisito" options={options} onSelect={vi.fn()} />
      </SprintDialog>
    );

    const input = screen.getByRole('combobox', { name: 'Requisito' });
    fireEvent.change(input, { target: { value: 'ma' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Editar tarefa' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
