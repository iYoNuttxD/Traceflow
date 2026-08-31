# Runbook — homologação visual de Auth com dados artificiais

## Objetivo e limites

Este procedimento prepara, exclusivamente em banco MySQL local de teste, contas artificiais para
as surfaces de Auth e ciclo de conta que dependem de estado persistido. Ele não cria bypass de
autenticação, rota especial, API, migration ou envio de e-mail externo. Login, guards, lifecycle e
tokens continuam usando os mesmos services do runtime.

As fixtures são aditivas e idempotentes. Uma nova execução restaura apenas as identidades artificiais
exatas listadas neste runbook, remove somente relações desses IDs e emite novos tokens locais. O
script não reseta, trunca nem limpa o restante do banco.

## Proteções obrigatórias

O comando aborta antes de importar Prisma ou services quando qualquer condição falha:

- `NODE_ENV` precisa ser `test`;
- `AUTH_VISUAL_FIXTURES` precisa ser `true`;
- `EMAIL_PROVIDER` precisa ser `capture` quando informado;
- `TEST_DATABASE_URL` precisa ser MySQL, ter `test` no nome, usar host local e apontar para schema
  diferente de `DATABASE_URL`;
- `FRONTEND_URL` precisa usar HTTP(S) local;
- `AUTH_VISUAL_FIXTURE_PASSWORD` precisa ter ao menos 16 caracteres.

Nunca aponte o comando para banco remoto, compartilhado, de desenvolvimento ou produção. Confirme
host, porta e schema sem imprimir usuário ou senha. Não use conta, e-mail, senha ou token pessoal.

## Pré-requisitos

1. Use o Node.js definido pela CI do projeto.
2. Suba um MySQL local com um schema exclusivo cujo nome contenha `test`.
3. Configure `TEST_DATABASE_URL` e mantenha `DATABASE_URL` em outro schema.
4. Aplique migrations no schema de teste com `npm run db:test:migrate`; não use reset.
5. Suba backend e frontend locais apontando para esse mesmo ambiente de teste.
6. Escolha uma senha exclusiva e descartável para as contas artificiais. Não a versione.

## Preparação

No diretório `backend/`, defina as variáveis apenas na sessão local e execute:

```bash
NODE_ENV=test \
AUTH_VISUAL_FIXTURES=true \
EMAIL_PROVIDER=capture \
AUTH_VISUAL_FIXTURE_PASSWORD='[SENHA_LOCAL_DE_FIXTURE]' \
npm run fixtures:auth-visual
```

O placeholder precisa ser substituído localmente por um valor descartável de ao menos 16
caracteres. Não copie esse valor para Git, documentação, screenshot ou relatório.

Antes de qualquer escrita, o script valida o destino. A saída contém somente host, porta e schema
sanitizados, usernames artificiais e URLs com `LOCAL DEV TOKEN`. Revise o destino sanitizado. Os
tokens são de uso único e não são gravados em arquivo; execute novamente para renovar o conjunto.

## Contas artificiais

Todas usam a senha fornecida em `AUTH_VISUAL_FIXTURE_PASSWORD`.

| Estado                | Username                       | E-mail artificial                             |
| --------------------- | ------------------------------ | --------------------------------------------- |
| E-mail não verificado | `visual_auth_unverified`       | `visual-auth-unverified@traceflow.test`       |
| Username pendente     | `visual_auth_username_pending` | `visual-auth-username-pending@traceflow.test` |
| Conta desativada      | `visual_auth_deactivated`      | `visual-auth-deactivated@traceflow.test`      |
| Exclusão pendente     | `visual_auth_deletion_pending` | `visual-auth-deletion-pending@traceflow.test` |
| Confirmação de e-mail | `visual_auth_verification`     | `visual-auth-verification@traceflow.test`     |
| Alteração de e-mail   | `visual_auth_email_change`     | `visual-auth-email-change@traceflow.test`     |
| Reativação            | `visual_auth_reactivation`     | `visual-auth-reactivation@traceflow.test`     |

Nenhuma fixture `ANONYMIZED` é criada porque não há surface E4 correspondente no inventário.

## Matriz de homologação

| Inventory Surface                     | Fixture                        | Como acessar                                                                               |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| `AUTH-LOGIN-PAGE`                     | Contexto anônimo               | Abra `/login` em perfil/contexto isolado, sem cookie de sessão, com tema Light.            |
| `AUTH-REGISTER-PAGE`                  | Contexto anônimo               | Abra `/register` no mesmo contexto anônimo Light.                                          |
| `AUTH-EMAIL-VERIFICATION-BANNER`      | `visual_auth_unverified`       | Faça login normal e abra uma rota autenticada.                                             |
| `AUTH-USERNAME-SETUP-BANNER`          | `visual_auth_username_pending` | Faça login normal e abra uma rota autenticada.                                             |
| `ACCOUNT-RESTRICTED-DEACTIVATED`      | `visual_auth_deactivated`      | Faça login normal; o guard encaminha para `/restricted`.                                   |
| `ACCOUNT-RESTRICTED-DELETION-PENDING` | `visual_auth_deletion_pending` | Faça login normal; o guard encaminha para `/restricted`.                                   |
| `AUTH-VERIFY-EMAIL`                   | URL `verification` da saída    | Abra a URL local em contexto isolado; ela executa a confirmação real uma vez.              |
| `ACCOUNT-EMAIL-CHANGE-CONFIRMATION`   | URL `emailChange` da saída     | Abra a URL local em contexto isolado; ela confirma a mudança do e-mail artificial uma vez. |
| `ACCOUNT-REACTIVATION-CONFIRMATION`   | URL `reactivation` da saída    | Abra a URL local em contexto isolado; ela reativa a conta artificial uma vez.              |

## Contexto anônimo Light

Use um novo contexto/perfil do navegador sem cookies do TraceFlow. Não altere `GuestOnlyRoute` e
não faça logout de uma conta pessoal para fabricar a evidência. Se o contexto não iniciar em Light,
selecione a preferência normal do produto quando disponível ou defina, apenas nesse storage local,
`traceflow.theme=light` antes da captura. Login e cadastro continuam acessíveis somente como usuário
realmente anônimo.

## Tokens e confirmações

Os links de verificação, alteração de e-mail e reativação são emitidos pelos services canônicos.
Eles preservam hash, expiração e uso único. O provider `capture` retém a mensagem somente no processo
local; nenhuma mensagem externa é enviada. A saída terminal identifica explicitamente as URLs como
`LOCAL DEV TOKEN`.

Abrir uma URL de sucesso executa uma mutação real, porém restrita à conta artificial. Para retornar
ao baseline ou repetir a captura, reexecute `npm run fixtures:auth-visual`; não edite banco nem token
manualmente.

## Loading transitório

As callbacks exibem loading enquanto a request real está pendente. A fixture não adiciona `sleep`,
delay de produção ou parâmetro especial para prolongar esse estado. Quando o ambiente local concluir
a request antes de uma captura confiável, registre:

```text
VISUAL RUNTIME LOADING: ENVIRONMENT LIMITATION
```

Os testes estruturais do frontend continuam sendo a evidência técnica desse estado; isso não deve
ser promovido a homologação visual.

## Retorno ao baseline

Não há cleanup geral. As contas usam namespace e domínio reservados, são seguras no banco local de
teste e a preparação idempotente restaura o conjunto lógico a cada execução. Para abandonar o
ambiente, descarte apenas o schema de teste pelo procedimento operacional autorizado do ambiente;
jamais execute limpeza ampla a partir deste runbook.

## Precauções finais

- Não use OAuth GitHub real, SMTP real ou conta principal.
- Não publique a saída que contém tokens locais.
- Não reutilize a senha de fixture em nenhum outro ambiente.
- Não marque uma surface como visualmente aprovada apenas porque a fixture existe.
- Depois da homologação, atualize o status somente com evidência renderizada no Work.
