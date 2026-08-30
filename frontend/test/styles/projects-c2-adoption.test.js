import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectStylePaths = [
  'src/features/projects/pages/ProjectsScreen.css',
  'src/features/projects/pages/ProjectDetailsScreen.css',
  'src/features/projects/components/ProjectAccessCodePanel.css',
  'src/features/projects/components/NewProjectDialog.css',
  'src/features/projects/components/ProjectBreadcrumb.css',
  'src/features/projects/components/ProjectForm.css',
  'src/features/projects/components/ProjectJoinCard.css',
  'src/features/projects/components/ProjectSectionNav.css',
  'src/features/projects/components/ProjectStatusBadge.css',
  'src/features/projects/styles/project-admin.css',
  'src/features/projects/pages/ProjectMembersScreen.css',
  'src/features/invitations/PendingProjectInvitations.css',
  'src/features/members/ProjectMembersPanel.css'
];

const projectStyles = projectStylePaths.map((path) => [path, readFileSync(resolve(path), 'utf8')]);
const projectsCss = readFileSync(resolve('src/features/projects/pages/ProjectsScreen.css'), 'utf8');
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

  it('preserva o grid responsivo aprovado de três, duas e uma coluna', () => {
    expect(projectsCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(projectsCss).toMatch(
      /@media \(max-width: 1180px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/
    );
    expect(projectsCss).toMatch(/@media \(max-width: 720px\)[\s\S]*grid-template-columns: 1fr/);
  });

  it('não reintroduz conteúdo fictício ou redundante na Overview', () => {
    expect(overviewSource).not.toMatch(
      /Área preparada para indicadores|GitHub sincronizado|Concept C2|Prototype|Demo UI/
    );
  });
});
