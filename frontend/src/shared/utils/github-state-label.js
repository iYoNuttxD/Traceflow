const labels = { open: 'Aberto', closed: 'Fechado', merged: 'Mesclado' };

export function githubStateLabel(state) {
  const key = String(state ?? '').toLowerCase();
  return Object.hasOwn(labels, key) ? labels[key] : 'Estado não informado';
}
