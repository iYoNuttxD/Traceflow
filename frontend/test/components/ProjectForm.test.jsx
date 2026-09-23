import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectForm, emptyProjectForm } from '../../src/features/projects/index.js';

const repository = {
  githubRepositoryId: '101',
  githubInstallationId: '77',
  owner: 'usuario-artificial',
  name: 'repositorio-artificial',
  fullName: 'usuario-artificial/repositorio-artificial',
  url: 'https://github.com/usuario-artificial/repositorio-artificial',
  private: false,
  defaultBranch: 'main'
};

function ProjectFormHarness({
  onSubmit,
  submitting = false,
  loadingRepositories = false,
  repositories = [repository]
}) {
  const [formData, setFormData] = useState(emptyProjectForm);

  return (
    <ProjectForm
      formData={formData}
      repositories={repositories}
      loadingRepositories={loadingRepositories}
      onChange={(name, value) => setFormData((current) => ({ ...current, [name]: value }))}
      onRepositoryChange={(fullName) => {
        const selected = fullName ? repository : null;
        setFormData((current) => ({
          ...current,
          selectedOwner: selected?.owner || '',
          selectedRepositoryName: selected?.name || '',
          selectedRepositoryFullName: selected?.fullName || '',
          selectedRepositoryUrl: selected?.url || ''
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
    await user.type(screen.getByLabelText('Área ou equipe responsável *'), 'Equipe artificial');
    await user.selectOptions(screen.getByLabelText('Repositório GitHub *'), repository.fullName);
    await user.click(screen.getByRole('button', { name: 'Cadastrar projeto' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByText(/Repositório selecionado:/)).toHaveTextContent(repository.fullName);
  });

  it('preserva estados desabilitados de carregamento e submissão', () => {
    render(<ProjectFormHarness onSubmit={vi.fn()} loadingRepositories submitting />);

    expect(screen.getByLabelText('Repositório GitHub *')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  });

  it.each([
    ['normal', { selectable: true, pendingDeletion: null }, false],
    [
      'pending deletion de OWNER',
      { selectable: true, pendingDeletion: { projectId: 2, projectName: 'Antigo' } },
      false
    ],
    [
      'pending deletion restrito',
      { selectable: false, pendingDeletion: { restricted: true } },
      true
    ],
    ['vinculado a outro projeto', { selectable: false, alreadyConnected: true }, true]
  ])('respeita selectable para repo %s', (_name, state, disabled) => {
    render(<ProjectFormHarness onSubmit={vi.fn()} repositories={[{ ...repository, ...state }]} />);
    const option = screen.getByRole('option', {
      name: /usuario-artificial\/repositorio-artificial/
    });
    expect(option.disabled).toBe(disabled);
  });
});
