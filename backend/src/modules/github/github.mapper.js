const GITHUB_URL_PREFIX = 'https://github.com/';
const URL_MAX_LENGTH = 512;
const TITLE_MAX_LENGTH = 256;
const BRANCH_MAX_LENGTH = 512;
const SHORT_TEXT_MAX_LENGTH = 255;

function toDate(value) {
  return value ? new Date(value) : null;
}

function fitText(value, maxLength) {
  if (value === null || value === undefined) return null;
  return Array.from(String(value)).slice(0, maxLength).join('');
}

function githubUrl(value) {
  if (typeof value !== 'string' || value.length > URL_MAX_LENGTH) return null;
  return value.startsWith(GITHUB_URL_PREFIX) ? value : null;
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
    authorName: fitText(item.commit?.author?.name, SHORT_TEXT_MAX_LENGTH),
    authorEmail: fitText(item.commit?.author?.email, SHORT_TEXT_MAX_LENGTH),
    authorUsername: item.author?.login ?? null,
    date: toDate(item.commit?.author?.date),
    githubUrl: githubUrl(item.html_url)
  };
}

export function mapGithubPullRequest(item) {
  return {
    githubId: String(item.id),
    number: item.number,
    title: fitText(item.title, TITLE_MAX_LENGTH),
    description: item.body ?? null,
    state: item.state ?? null,
    authorUsername: item.user?.login ?? null,
    sourceBranch: fitText(item.head?.ref, BRANCH_MAX_LENGTH),
    targetBranch: fitText(item.base?.ref, BRANCH_MAX_LENGTH),
    githubUrl: githubUrl(item.html_url),
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
    title: fitText(item.title, TITLE_MAX_LENGTH),
    description: item.body ?? null,
    state: item.state ?? null,
    authorUsername: item.user?.login ?? null,
    assigneeUsername: item.assignee?.login ?? null,
    labels: (item.labels || []).map(mapGithubIssueLabel),
    milestone: fitText(item.milestone?.title, SHORT_TEXT_MAX_LENGTH),
    githubUrl: githubUrl(item.html_url),
    createdAtGithub: toDate(item.created_at),
    updatedAtGithub: toDate(item.updated_at),
    closedAtGithub: toDate(item.closed_at)
  };
}
