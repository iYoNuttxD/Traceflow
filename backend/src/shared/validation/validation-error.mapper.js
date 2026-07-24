function fieldFromPath(path, location) {
  const normalizedPath = Array.isArray(path) ? path.map(String) : [];
  return normalizedPath.length > 0 ? normalizedPath.join('.') : location;
}

export function mapValidationIssues(issues, location) {
  return issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ field: String(key), message: 'Campo não permitido.' }));
    }

    return [{
      field: fieldFromPath(issue.path, location),
      message: issue.message
    }];
  });
}
