import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskForm, emptyTaskForm } from './TaskForm.jsx';

function TaskFormHarness({ onSubmit, editing = false, submitting = false, members = [] }) {
  const [formData, setFormData] = useState(emptyTaskForm);

  return (
    <TaskForm
      formData={formData}
      onChange={(name, value) => setFormData((current) => ({ ...current, [name]: value }))}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      submitting={submitting}
      editing={editing}
      projectMembers={members}
    />
  );
}

describe('TaskForm', () => {
  it('renderiza, preenche o título e submete o formulário atual', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(<TaskFormHarness onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Título da tarefa')).toBeRequired();
    expect(screen.getByRole('combobox', { name: /Responsável/ })).toBeDisabled();
    expect(screen.getByText(/Cadastre membros no projeto/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Título da tarefa'), 'Tarefa artificial');
    await user.selectOptions(screen.getByLabelText('Prioridade'), 'ALTA');
    await user.click(screen.getByRole('button', { name: 'Cadastrar tarefa' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Título da tarefa')).toHaveValue('Tarefa artificial');
    expect(screen.getByLabelText('Prioridade')).toHaveValue('ALTA');
  });

  it('exibe esforço realizado em edição e mantém o submit desabilitado', () => {
    render(<TaskFormHarness onSubmit={vi.fn()} editing submitting />);

    expect(screen.getByLabelText('Esforço realizado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  });
});
