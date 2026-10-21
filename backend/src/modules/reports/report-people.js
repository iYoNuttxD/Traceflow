// Os serviços de origem identificam pessoas por `userId` e trazem o nome atual em
// `displayName` ou `name`. No snapshot só o ID permanece: o nome do momento da geração
// fica em ProjectReportPerson, onde a anonimização consegue neutralizá-lo.
const PERSON_FIELDS = ['displayName', 'name', 'username', 'email', 'avatarUrl'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPersonReference(value) {
  return isPlainObject(value) && Number.isSafeInteger(value.userId) && value.userId > 0;
}

export function stripPeople(snapshot) {
  const userIds = new Set();
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (!isPlainObject(value)) return value;
    const person = isPersonReference(value);
    if (person) userIds.add(value.userId);
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (person && PERSON_FIELDS.includes(key)) continue;
      result[key] = visit(item);
    }
    return result;
  }
  return { snapshot: visit(snapshot), userIds: [...userIds].sort((a, b) => a - b) };
}

// Conta inexistente não deveria ocorrer (User não é removido fisicamente), mas o
// relatório não pode falhar nem inventar um nome por causa disso.
export const UNKNOWN_PERSON_NAME = 'Usuário removido';

// Congela o nome e o usuário vigentes no momento da geração. Uma conta já anonimizada
// tem nome e usuário neutros na própria tabela User, e é isso que fica registrado.
export function freezePeople(userIds, users) {
  const byId = new Map(users.map((user) => [user.id, user]));
  return userIds.map((userId) => {
    const user = byId.get(userId);
    return {
      userId,
      displayNameSnapshot: String(user?.name || '').slice(0, 191) || UNKNOWN_PERSON_NAME,
      usernameSnapshot: user?.username ? String(user.username).slice(0, 191) : null
    };
  });
}
