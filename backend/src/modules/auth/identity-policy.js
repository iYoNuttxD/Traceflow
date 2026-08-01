const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'support',
  'traceflow',
  'system',
  'api',
  'null',
  'undefined',
  'login',
  'register',
  'account',
  'security',
  'privacy',
  'github'
]);

const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890',
  'password1234',
  'password123',
  'qwerty123456',
  'qwertyuiop12',
  'administrator',
  'iloveyou1234',
  'welcome12345',
  'letmein123456',
  'senha123456',
  'senha12345678',
  'traceflow123',
  'abc123456789',
  '000000000000'
]);

export function normalizeUsername(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function validateUsername(value) {
  const username = normalizeUsername(value);
  if (username.length < 3 || username.length > 30)
    return {
      valid: false,
      username,
      message: 'O nome de usuário deve ter entre 3 e 30 caracteres.'
    };
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(username))
    return {
      valid: false,
      username,
      message:
        'Use letras minúsculas, números, ponto, hífen ou underline, sem separador nas extremidades.'
    };
  if (RESERVED_USERNAMES.has(username))
    return { valid: false, username, message: 'Este nome de usuário é reservado.' };
  return { valid: true, username };
}

export function passwordPolicyErrors(password, { username, email } = {}) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 12)
    errors.push('A senha deve possuir ao menos 12 caracteres.');
  if (typeof password === 'string' && password.length > 128)
    errors.push('A senha deve possuir no máximo 128 caracteres.');
  const normalizedPassword = String(password ?? '').toLocaleLowerCase('pt-BR');
  const normalizedUsername = normalizeUsername(username);
  const normalizedEmail = String(email ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  const emailLocalPart = normalizedEmail.split('@')[0];
  if (COMMON_PASSWORDS.has(normalizedPassword)) errors.push('Escolha uma senha menos comum.');
  if (normalizedUsername && normalizedPassword === normalizedUsername)
    errors.push('A senha não pode ser igual ao nome de usuário.');
  if (normalizedEmail && normalizedPassword === normalizedEmail)
    errors.push('A senha não pode ser igual ao e-mail.');
  if (normalizedUsername.length >= 3 && normalizedPassword.includes(normalizedUsername))
    errors.push('A senha não pode conter integralmente o nome de usuário.');
  if (emailLocalPart.length >= 3 && normalizedPassword.includes(emailLocalPart))
    errors.push('A senha não pode conter integralmente a parte identificadora do e-mail.');
  return [...new Set(errors)];
}

export const usernamePolicy = Object.freeze({ reserved: Object.freeze([...RESERVED_USERNAMES]) });
