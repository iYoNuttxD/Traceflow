import { Link } from 'react-router';
import './ProjectBreadcrumb.css';

export function ProjectBreadcrumb({ projectName, currentLabel }) {
  return (
    <nav className="project-breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to="/projects">Projetos</Link>
        </li>
        <li aria-hidden="true">/</li>
        {currentLabel ? (
          <>
            <li>
              <Link to=".." relative="path">
                {projectName}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">{currentLabel}</li>
          </>
        ) : (
          <li aria-current="page">{projectName}</li>
        )}
      </ol>
    </nav>
  );
}
