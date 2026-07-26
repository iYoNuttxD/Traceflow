# Registro de risco de dependências

## Gate executável E14

Em 26/07/2026, `scripts/check-npm-audit.mjs` passou a bloquear toda vulnerabilidade `high` ou `critical` não registrada de forma específica. A política versionada em `npm-audit-exceptions.json` exige advisory ID, pacote, cadeia, severidade, justificativa, data da decisão, condição/data de revisão e responsável; exceções expiradas falham. O Dependency Review complementa a política sobre o delta de pull requests.

A única exceção vigente é:

| Advisory | Pacote/cadeia | Severidade | Justificativa | Decisão | Revisão | Responsável |
|---|---|---:|---|---|---|---|
| `GHSA-qwww-vcr4-c8h2` | `react-router-dom` → `react-router` | ALTA | vetor depende de React Server Components/actions; TRACEFLOW é SPA client-side sem RSC, SSR, actions ou loaders de servidor | risco residual temporário, sem downgrade incompatível | 26/10/2026 ou antes se RSC/SSR for adotado ou houver correção compatível | mantenedores TRACEFLOW |

Essa exceção não libera genericamente `react-router` nem outro advisory. O backend possui zero vulnerabilidades no baseline E14. Nenhum `npm audit fix` foi executado.

ESLint, Prettier, `@eslint/js` e `globals` foram adicionados como dependências de desenvolvimento; o frontend também recebeu `eslint-plugin-react-hooks`. O audit após a atualização não introduziu novo advisory. Nenhuma dessas ferramentas integra o runtime da aplicação.

## Revalidação E11

Em 26/07/2026, o backend permaneceu com zero vulnerabilidades. O frontend manteve duas entradas altas do advisory `GHSA-qwww-vcr4-c8h2` em React Router RSC. O TRACEFLOW continua SPA client-side, sem RSC/actions; o audit propõe mudança incompatível e nenhuma correção automática foi executada. E11 não alterou dependências ou lockfiles.

## Revalidação E9

Em 25/07/2026, nova execução manteve o backend com zero vulnerabilidades e o frontend com duas entradas altas do mesmo advisory React Router RSC já registrado abaixo. A E9 não alterou dependências nem lockfiles e não executou correção automática.

## Atualização E6

- `argon2@0.44.0` foi adicionado ao runtime para Argon2id; compatível com Node 22 e audit backend com zero vulnerabilidades.
- `nodemailer@9.0.3` foi adicionado para SMTP. A 7.0.10 inicialmente instalada apresentou advisories altos; a major corrigida foi adotada após análise da pequena API usada (`createTransport`/`sendMail`) e teste de compatibilidade.
- O frontend permanece com 2 entradas altas do advisory React Router RSC. O TRACEFLOW é SPA client-side e não usa RSC/actions; a correção proposta pelo audit exige downgrade/breaking change e não foi aplicada automaticamente.

## Método

Registro gerado em 24/07/2026 com `npm audit`, `npm ls` e análise do uso real. Não foi executado `npm audit fix` nem `--force`; somente atualizações pontuais dentro de faixas compatíveis foram aplicadas e validadas por testes/build.

## Backend

| Pacote | Origem | Severidade inicial | Aplicabilidade | Decisão | Estado final |
|---|---|---:|---|---|---|
| `body-parser` 1.20.5 | transitivo de Express | BAIXA | Runtime; limite inválido poderia desativar proteção de tamanho | atualizado para 1.20.6 dentro da faixa existente; E5 também valida `BODY_LIMIT` | CORRIGIDO |
| `brace-expansion` 5.0.6 | nodemon/minimatch | ALTA | Desenvolvimento; não entra no runtime de produção | atualizado para 5.0.8 dentro da faixa existente | CORRIGIDO |
| `helmet` 8.3.0 | direta | — | Runtime; headers de segurança | adicionada, Node >=18 | ACEITO |
| `express-rate-limit` 8.6.0 | direta | — | Runtime; anti-automação em instância única | adicionada, Node >=16; MemoryStore documentado | ACEITO_COM_LACUNA |
| `nodemailer` 7.0.10 → 9.0.3 | direta | ALTA | Runtime; SMTP command/header injection, file/URL access e TLS/OAuth2 em versões afetadas | atualização pontual para a versão indicada pelo advisory; adapter testado sem rede | CORRIGIDO |

Resultado final backend: **0 vulnerabilidades** no `npm audit`.

## Frontend

| Pacote | Achado | Aplicabilidade | Decisão | Estado final |
|---|---|---|---|---|
| `axios` 1.17.x | recursão, pollution, proxy e limites de upload | Cliente HTTP direto | atualizado para 1.18.0 | CORRIGIDO |
| `form-data` 4.0.5 | CRLF em multipart | Transitivo de Axios; browser não usa adapter Node em produção, mas estava no grafo | atualizado para 4.0.6 | CORRIGIDO |
| `postcss` <=8.5.17 | leitura de source map/path traversal | Build Vite, não runtime do navegador | atualizado para 8.5.23 | CORRIGIDO |
| `react-router`/`react-router-dom` 7.18.0 | bypass CSRF em modo RSC | TRACEFLOW usa `BrowserRouter`/SPA, sem RSC, actions, loaders ou server rendering | não fazer downgrade/major automático; monitorar release corrigida compatível | RISCO_RESIDUAL_NÃO_EXPLORÁVEL_NO_USO_ATUAL |

Resultado final frontend: **2 entradas altas** no `npm audit`, ambas representando o mesmo advisory transitivo/direto de React Router RSC. O audit sugere alteração incompatível; a suíte atual não cobre migração major. A decisão deve ser revista quando houver versão compatível ou se RSC/actions forem introduzidos.

## Política de atualização

- crítica de runtime aplicável: tratar imediatamente;
- alta de runtime aplicável: corrigir no ciclo corrente ou aceitar formalmente com mitigação;
- desenvolvimento/build: avaliar alcance e corrigir por patch/minor quando seguro;
- nenhuma major automática sem análise de API, testes e plano de rollback;
- lockfiles são obrigatórios; fontes esperadas são o registry npm e o repositório oficial do pacote;
- Dependency review é obrigatório em pull requests desde a E14. SBOM automatizada permanece como evolução futura.
