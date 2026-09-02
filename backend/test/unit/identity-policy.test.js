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
  });
  it('aceita Unicode e espaços na senha, mas bloqueia comuns e dados da conta', () => {
    expect(
      passwordPolicyErrors('Frase longa segura 🔐', {
        username: 'pessoa',
        email: 'pessoa@example.test'
      })
    ).toEqual([]);
    expect(passwordPolicyErrors('senha123456')).toContain('Escolha uma senha menos comum.');
    expect(passwordPolicyErrors('prefixo-pessoa-sufixo', { username: 'pessoa' })).toContain(
      'A senha não pode conter integralmente o nome de usuário.'
    );
  });
});
