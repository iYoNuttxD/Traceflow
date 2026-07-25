function toDate(value) {
  return value ? new Date(value) : null;
}

export function mapGithubRepository(item) {
  return {
    githubRepositoryId: String(item.id),
    name: item.name,
    owner: item.owner?.login,
    fullName: item.full_name,
    url: item.html_url,
    defaultBranch: item.default_branch,
    private: item.private === true,
    description: item.description ?? null
  };
}

export function mapGithubCommit(item, branch) {
  return {
    hash: item.sha,
    message: item.commit?.message ?? null,
    authorName: item.commit?.author?.name ?? null,
    authorEmail: item.commit?.author?.email ?? null,
    authorUsername: item.author?.login ?? null,
    date: toDate(item.commit?.author?.date),
    branch,
    githubUrl: item.html_url ?? null
  };
}

export function mapGithubPullRequest(item) {
  return {
    githubId: String(item.id),
    number: item.number,
    title: item.title,
    description: item.body ?? null,
    state: item.state ?? null,
    authorUsername: item.user?.login ?? null,
    sourceBranch: item.head?.ref ?? null,
    targetBranch: item.base?.ref ?? null,
    githubUrl: item.html_url ?? null,
    createdAtGithub: toDate(item.created_at),
    updatedAtGithub: toDate(item.updated_at),
    closedAtGithub: toDate(item.closed_at),
    mergedAtGithub: toDate(item.merged_at)
  };
}

function mapGithubIssueLabel(label) {
  if (typeof label === 'string') return label;
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description ?? null
  };
}

export function mapGithubIssue(item) {
  if (item.pull_request) return null;

  return {
    githubId: String(item.id),
    number: item.number,
    title: item.title,
    description: item.body ?? null,
    state: item.state ?? null,
    authorUsername: item.user?.login ?? null,
    assigneeUsername: item.assignee?.login ?? null,
    labels: (item.labels || []).map(mapGithubIssueLabel),
    milestone: item.milestone?.title ?? null,
    githubUrl: item.html_url ?? null,
    createdAtGithub: toDate(item.created_at),
    updatedAtGithub: toDate(item.updated_at),
    closedAtGithub: toDate(item.closed_at)
  };
}
