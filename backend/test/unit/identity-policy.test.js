import { describe, expect, it } from 'vitest';
import {
  normalizeUsername,
  passwordPolicyErrors,
  validateUsername
} from '../../src/modules/auth/identity-policy.js';

describe('políticas de identidade L1', () => {
  it('normaliza username e rejeita reservados, espaços e separadores nas extremidades', () => {
    expect(normalizeUsername('  Pessoa.Teste  ')).toBe('pessoa.teste');
    expect(validateUsername('admin').valid).toBe(false);
    expect(validateUsername('-pessoa').valid).toBe(false);
    expect(validateUsername('pessoa válida').valid).toBe(false);
    expect(validateUsername('pessoa_teste').valid).toBe(true);
    for (const invalid of ['pessoa-', 'pessoa_', 'pessoa.', 'AdMiN', 'ab', 'a'.repeat(31)])
      expect(validateUsername(invalid).valid).toBe(false);
    for (const valid of ['abc', 'a'.repeat(30)]) expect(validateUsername(valid).valid).toBe(true);
  });
  it.each([8, 11, 12, 128, 129])('aplica os limites independentes de tamanho: %i', (length) => {
    const errors = passwordPolicyErrors('X'.repeat(length));
    expect(errors).toEqual(
      length < 12
        ? ['A senha deve possuir ao menos 12 caracteres.']
        : length > 128
          ? ['A senha deve possuir no máximo 128 caracteres.']
          : []
    );
  });

  it('aceita Unicode e espaços na senha, mas bloqueia comuns e dados da conta', () => {
    expect(
      passwordPolicyErrors('Frase longa segura 🔐', {
        username: 'pessoa',
        email: 'pessoa@example.test'
      })
    ).toEqual([]);
    expect(
      passwordPolicyErrors('prefixo-contato-sufixo', { email: 'contato@example.test' })
    ).toContain('A senha não pode conter integralmente a parte identificadora do e-mail.');
    expect(
      passwordPolicyErrors('contato@example.test', { email: 'contato@example.test' })
    ).toContain('A senha não pode ser igual ao e-mail.');
    expect(passwordPolicyErrors('pessoa', { username: 'pessoa' })).toContain(
      'A senha não pode ser igual ao nome de usuário.'
    );
    expect(passwordPolicyErrors('senha123456')).toContain('Escolha uma senha menos comum.');
    expect(passwordPolicyErrors('prefixo-pessoa-sufixo', { username: 'pessoa' })).toContain(
      'A senha não pode conter integralmente o nome de usuário.'
    );
  });
});
