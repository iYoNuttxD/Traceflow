export async function* paginateGithub(fetchPage, { perPage = 100 } = {}) {
  let page = 1;

  while (true) {
    const response = await fetchPage({ page, perPage });
    const items = Array.isArray(response?.items) ? response.items : [];
    yield items;

    if (
      response?.hasNext === false ||
      (response?.hasNext === undefined && items.length < perPage)
    ) {
      return;
    }

    page += 1;
  }
}

export async function collectGithubPages(pages) {
  const items = [];
  for await (const page of pages) items.push(...page);
  return items;
}
