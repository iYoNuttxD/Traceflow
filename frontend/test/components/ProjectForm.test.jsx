import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectForm, emptyProjectForm } from '../../src/features/projects/index.js';

const repository = {
  id: '101',
  owner: 'usuario-artificial',
  name: 'repositorio-artificial',
  fullName: 'usuario-artificial/repositorio-artificial',
  url: 'https://github.com/usuario-artificial/repositorio-artificial',
  private: false
};

function ProjectFormHarness({ onSubmit, submitting = false, loadingRepositories = false }) {
  const [formData, setFormData] = useState(emptyProjectForm);

  return (
    <ProjectForm
      formData={formData}
      repositories={[repository]}
      loadingRepositories={loadingRepositories}
      onChange={(name, value) => setFormData((current) => ({ ...current, [name]: value }))}
      onRepositoryChange={(fullName) => {
        const selected = fullName ? repository : null;
        setFormData((current) => ({
          ...current,
          githubOwner: selected?.owner || '',
          githubRepo: selected?.name || '',
          githubUrl: selected?.url || ''
        }));
      }}
      onSubmit={onSubmit}
      submitLabel="Cadastrar projeto"
      submitting={submitting}
    />
  );
}

describe('ProjectForm', () => {
  it('preenche os campos e submete usando a validação visual atual', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(<ProjectFormHarness onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Nome do projeto *')).toBeRequired();
    expect(screen.getByLabelText('Área ou equipe responsável *')).toBeRequired();
    expect(screen.getByLabelText('Repositório GitHub *')).toBeRequired();
    await user.type(screen.getByLabelText('Nome do projeto *'), 'Projeto artificial');
    await user.type(screen.getByLabelText('Descrição'), 'Descrição artificial');
    await user.type(
      screen.getByLabelText('Área ou equipe responsável *'),
      'Equipe artificial'
    );
    await user.selectOptions(
      screen.getByLabelText('Repositório GitHub *'),
      repository.fullName
    );
    await user.click(screen.getByRole('button', { name: 'Cadastrar projeto' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByText(/Repositório selecionado:/)).toHaveTextContent(
      repository.fullName
    );
  });

  it('preserva estados desabilitados de carregamento e submissão', () => {
    render(
      <ProjectFormHarness
        onSubmit={vi.fn()}
        loadingRepositories
        submitting
      />
    );

    expect(screen.getByLabelText('Repositório GitHub *')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  });
});
