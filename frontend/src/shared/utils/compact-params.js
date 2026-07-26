export function compactParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      return typeof value !== 'string' || value.trim() !== '';
    })
  );
}
