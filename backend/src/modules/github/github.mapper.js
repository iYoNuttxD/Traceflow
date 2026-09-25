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

export function mapGithubBranch(item) {
  return {
    name: item.name,
    headSha: item.commit?.sha ?? null
  };
}

export function mapGithubCommit(item) {
  return {
    hash: item.sha,
    message: item.commit?.message ?? null,
    authorName: item.commit?.author?.name ?? null,
    authorEmail: item.commit?.author?.email ?? null,
    authorUsername: item.author?.login ?? null,
    authorGithubUserId: item.author?.id == null ? null : String(item.author.id),
    date: toDate(item.commit?.author?.date),
    githubUrl: item.html_url ?? null
  };
}

export function mapGithubPullRequestLifecycleEvent(item) {
  if (!item.issue?.pull_request || !['closed', 'reopened', 'merged'].includes(item.event)) {
    return null;
  }
  if (item.id == null || !Number.isInteger(item.issue.number) || !item.created_at) {
    throw new Error('Evento de lifecycle de Pull Request sem identidade ou data do GitHub.');
  }
  const occurredAt = new Date(item.created_at);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('Evento de lifecycle de Pull Request com data inválida.');
  }
  return {
    providerEventId: String(item.id),
    number: item.issue.number,
    eventType: item.event.toUpperCase(),
    occurredAt
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
