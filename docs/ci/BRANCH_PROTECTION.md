# Proteção recomendada da branch `main`

Esta configuração é operacional e deve ser aplicada por um mantenedor no GitHub. A E14 não alterou configurações remotas.

## Regras recomendadas

- exigir pull request antes do merge;
- exigir ao menos uma aprovação;
- exigir branch atualizada com `main` antes do merge;
- exigir resolução de todas as conversas;
- bloquear force push e exclusão da branch;
- dispensar aprovações antigas quando houver novos commits, conforme a política da equipe;
- aplicar as regras também a administradores, salvo procedimento emergencial auditável.

## Checks obrigatórios

Os nomes abaixo são estáveis e devem ser selecionados exatamente assim:

- `Quality`;
- `Backend Tests`;
- `Frontend Tests`;
- `Supply Chain`;
- `Dependency Review` — obrigatório em pull requests; não é executado em pushes comuns.

`Quality`, `Backend Tests`, `Frontend Tests` e `Supply Chain` executam em push para `main` e em pull request. Nenhum job usa `continue-on-error`, `--if-present` ou tolerância genérica a falhas.

## Administração

Mudanças nos nomes, eventos ou permissões dos checks exigem atualização coordenada deste documento e da proteção remota. O workflow usa somente `contents: read` globalmente; `Dependency Review` recebe adicionalmente `pull-requests: read` no próprio job.
