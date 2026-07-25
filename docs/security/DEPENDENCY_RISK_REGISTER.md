# Registro de risco de dependências

## Atualização E6

- `argon2@0.44.0` foi adicionado ao runtime para Argon2id; compatível com Node 22 e audit backend com zero vulnerabilidades.
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
- SBOM automatizada e dependency review no CI permanecem para E14.
