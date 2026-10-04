import { githubBranchRepository } from '../github-branch.repository.js';
import { ProjectServiceError } from '../../projects/project.schema.js';

export async function syncProjectBranches({
  project,
  repository,
  githubClient,
  now = new Date(),
  assertActive = async () => {}
}) {
  const observed = [];
  for await (const page of githubClient.listBranchPages({
    owner: repository.owner,
    repo: repository.name
  })) {
    await assertActive();
    observed.push(...page);
  }
  const unique = [
    ...new Map(
      observed.filter((branch) => branch.name).map((branch) => [branch.name, branch])
    ).values()
  ];

  if (unique.length === 0) {
    throw new ProjectServiceError(
      'O GitHub não retornou branches acessíveis para o repositório.',
      502
    );
  }

  await assertActive();

  const active = await githubBranchRepository.syncObserved(
    project.id,
    unique,
    repository.defaultBranch,
    now
  );
  return {
    branches: active,
    summary: {
      found: unique.length,
      active: active.length,
      defaultBranch: active.find((branch) => branch.isDefault)?.name || repository.defaultBranch
    }
  };
}
