import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectStylePaths = [
  'src/features/projects/pages/ProjectsScreen.css',
  'src/features/projects/pages/ProjectDetailsScreen.css',
  'src/features/projects/components/ProjectAccessCodePanel.css',
  'src/features/projects/components/NewProjectDialog.css',
  'src/features/projects/components/ProjectForm.css',
  'src/features/projects/components/ProjectJoinCard.css',
  'src/features/projects/components/ProjectStatusBadge.css',
  'src/features/projects/components/MemberAvatarStack.css',
  'src/features/projects/styles/project-admin.css',
  'src/features/projects/styles/project-tabs.css',
  'src/features/projects/pages/ProjectMembersScreen.css',
  'src/features/invitations/PendingProjectInvitations.css',
  'src/features/members/ProjectMembersPanel.css',
  'src/shared/components/BackButton.css',
  'src/shared/components/TraceFlowIcon.css'
];

const projectStyles = projectStylePaths.map((path) => [path, readFileSync(resolve(path), 'utf8')]);
const projectsCss = readFileSync(resolve('src/features/projects/pages/ProjectsScreen.css'), 'utf8');
const overviewCss = readFileSync(
  resolve('src/features/projects/pages/ProjectDetailsScreen.css'),
  'utf8'
);
const membersCss = readFileSync(resolve('src/features/members/ProjectMembersPanel.css'), 'utf8');
const accessCodeCss = readFileSync(
  resolve('src/features/projects/components/ProjectAccessCodePanel.css'),
  'utf8'
);
const backButtonCss = readFileSync(resolve('src/shared/components/BackButton.css'), 'utf8');
const overviewSource = readFileSync(
  resolve('src/features/projects/pages/ProjectDetailsScreen.jsx'),
  'utf8'
);

describe('adoção do Concept C2 em Projects', () => {
  it('mantém os owners redesenhados dependentes de tokens semânticos', () => {
    for (const [path, css] of projectStyles) {
      expect(css, `Cor hardcoded encontrada em ${path}`).not.toMatch(
        /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i
      );
    }
  });

  it('reorganiza Overview e Members pela largura disponível no owner', () => {
    expect(overviewCss).toContain('container-name: project-overview-page');
    expect(overviewCss).toMatch(/@container project-overview-page \(max-width: 45rem\)/);
    expect(overviewCss).not.toContain('@media (max-width: 1180px)');
    expect(membersCss).toContain('container-name: member-panel');
    expect(membersCss).toMatch(/@container member-panel \(max-width: 46rem\)/);
  });

  it('remove o flex-basis horizontal do título quando o header vira coluna', () => {
    expect(overviewCss).toMatch(
      /@container project-overview-page \(max-width: 45rem\)[\s\S]*\.project-details-screen__title-group \{\s*flex: 0 1 auto;/
    );
  });

  it('mantém o retorno compartilhado como icon button de touch target completo', () => {
    expect(backButtonCss).toContain('width: var(--size-touch-target)');
    expect(backButtonCss).toContain('height: var(--size-touch-target)');
    expect(backButtonCss).toContain('.back-button:focus-visible');
  });

  it('reserva espaço para a busca e normaliza as ações do código de acesso', () => {
    expect(membersCss).toContain('.team-panel .member-search-control input');
    expect(membersCss).toContain('padding-inline-start: calc(');
    expect(membersCss).toContain('pointer-events: none');
    expect(accessCodeCss).toContain('display: inline-flex');
    expect(accessCodeCss).toContain('min-width: var(--size-touch-target)');
    expect(accessCodeCss).toContain('height: var(--size-touch-target)');
    expect(accessCodeCss).toContain('align-items: center');
    expect(accessCodeCss).toContain('justify-content: center');
    expect(accessCodeCss).toContain('background: var(--color-surface-interactive)');
    expect(accessCodeCss).not.toContain('[data-theme');
  });

  it('adapta o grid ao container e preserva uma largura mínima saudável', () => {
    expect(projectsCss).toContain('container-type: inline-size');
    expect(projectsCss).toContain('repeat(3, minmax(min(100%, 17.5rem), 1fr))');
    expect(projectsCss).toMatch(
      /@container projects-page \(max-width: 58rem\)[\s\S]*repeat\(2, minmax\(min\(100%, 17\.5rem\), 1fr\)\)/
    );
    expect(projectsCss).toMatch(
      /@container projects-page \(max-width: 37\.5rem\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/
    );
    expect(projectsCss).not.toMatch(
      /@media \(max-width: 1180px\)[\s\S]*grid-template-columns: repeat\(2/
    );
  });

  it('não reintroduz conteúdo fictício ou redundante na Overview', () => {
    expect(overviewSource).not.toMatch(
      /Área preparada para indicadores|GitHub sincronizado|Concept C2|Prototype|Demo UI/
    );
  });
});
