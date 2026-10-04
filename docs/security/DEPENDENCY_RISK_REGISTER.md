# Registro de risco de dependências

## P10 — encerramento dos moderates remanescentes — 04/10/2026

**CORRIGIDO e revalidado:** o audit completo final de backend e frontend, incluindo
desenvolvimento, retornou **0 vulnerabilidades em todas as severidades**. O gate
canônico passou sem exceções. Os números das seções anteriores são históricos.

| Cadeia afetada na baseline | Advisory | Correção validada |
| --- | --- | --- |
| Vitest / coverage / mocker `4.1.10`, nos dois projetos | [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | Família Vitest `4.1.11` |
| Multer `2.3.0` | [GHSA-3pph-fpjx-jg34](https://github.com/advisories/GHSA-3pph-fpjx-jg34) | Multer `2.4.0` |
| Express / body-parser / qs `6.15.2` | [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | Express `4.22.3`, body-parser `1.20.8`, qs `6.16.0` |
| ip-address `10.5.0` | [GHSA-rpw4-54j3-4h4q](https://github.com/advisories/GHSA-rpw4-54j3-4h4q), [GHSA-2vr4-cq9g-pvrc](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc), [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv), [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw) | ip-address `10.7.3` |

Atualizações limitadas às cadeias afetadas, com remoção de cinco transitivas
exclusivas do Multer antigo. Sem downgrade, override, waiver ou mudança da policy.
`npm ci` reproduziu ambos os lockfiles com Node 22 e npm 10.9.9; as suítes completas
e o build foram reexecutados. Evidências e limites da revisão constam no
[relatório P10](../deliveries/S2_P10_FINAL_CODE_REVIEW_RELEASE_READINESS_REPORT.md).

## P8.6E — fechamento da cadeia nodemon — 04/10/2026

**CORRIGIDO por remoção da cadeia:** [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), HIGH, anteriormente em `nodemon@3.1.14 → chokidar@3.6.0 → braces@3.0.3`. O backend passou a usar `node --watch src/server.js` no script `dev`, com Node 22.23.3. Startup, restart após mudança em módulo importado, readiness com Prisma e shutdown por Ctrl+C foram verificados no comando final `npm run dev`.

`npm ci --offline --no-audit` reproduziu a instalação. O audit completo posterior, incluindo desenvolvimento, confirmou a ausência do advisory e **0 high / 0 critical**. `npm ls nodemon chokidar braces --all` não encontrou nenhum dos três pacotes. O lockfile perdeu 22 entradas exclusivas da cadeia; nenhuma versão mantida foi atualizada. Não houve downgrade, nova dependência, override ou exceção; a política existente permanece intacta.

O `npm audit --json` bruto ainda retorna código 1 por **8 entradas moderate preexistentes**, idênticas ao baseline: `@vitest/coverage-v8@4.1.10`, `@vitest/mocker@4.1.10`, `vitest@4.1.10`, `body-parser@1.20.6`, `express@4.22.2`, `qs@6.15.2`, `ip-address@10.5.0` e `multer@2.3.0`. Não são novos blockers HIGH/CRITICAL e não foram corrigidas nesta rodada restrita. O gate canônico de backend e frontend aprovou sem exceções. Isto não representa audit com zero vulnerabilidades em todas as severidades.

Os blockers de segurança dos relatórios P8.6C/P8.6D estão encerrados. Evidências, limites e gates: [relatório P8.6E](../deliveries/S2_P8_6E_SECURITY_DEPENDENCY_CLOSURE_REPORT.md). Os registros anteriores abaixo preservam os resultados de suas respectivas datas.

## Revalidação Nodemailer — 09/09/2026

A E6 adotou `nodemailer@9.0.3` conforme os advisories conhecidos naquela etapa. Os quatro advisories abaixo foram publicados posteriormente; esta atualização preserva aquele registro histórico e corrige a dependência para `9.1.1`.

| Advisory | Versões afetadas | Primeira versão corrigida |
|---|---|---|
| [GHSA-8m3c-c648-2xjj](https://github.com/advisories/GHSA-8m3c-c648-2xjj) | `<=9.1.0` | `9.1.1` |
| [GHSA-wmmp-3585-3rmp](https://github.com/advisories/GHSA-wmmp-3585-3rmp) | `<9.1.0` | `9.1.0` |
| [GHSA-2x7j-588g-ccc2](https://github.com/advisories/GHSA-2x7j-588g-ccc2) | `<9.1.0` | `9.1.0` |
| [GHSA-cc9r-2j5m-2m83](https://github.com/advisories/GHSA-cc9r-2j5m-2m83) | `>=6.9.16 <9.1.0` | `9.1.0` |

`9.1.1` é a menor versão estável que corrige os quatro simultaneamente. Seu requisito de runtime (`node >=6.0.0`) admite Node 22, usado na validação local. `npm install nodemailer@9.1.1 --save` atualizou somente o Nodemailer nos arquivos de dependências do backend; `npm ci` reproduziu a instalação. Não foi adicionado override ou exceção, nem alterada a política de audit.

O adapter permanece inalterado: `createTransport`/`sendMail`, provider `capture`, templates HTML/text de convite, recuperação de senha e verificação de e-mail foram validados sem envio externo. O smoke do SMTP utilizou o Nodemailer instalado com transporte de saída simulado em JSON. As opções existentes `disableFileAccess: true` e `disableUrlAccess: true` continuam compatíveis e rejeitaram conteúdo por arquivo/URL antes de qualquer I/O; não houve validação de entrega por um servidor SMTP externo.

O audit posterior removeu os quatro advisories da árvore instalada e confirmou **0 high, 0 critical e nenhuma vulnerabilidade de Nodemailer**. Permanecem **6 entradas moderate preexistentes e idênticas ao baseline**, nas cadeias de `qs`/Express e Vitest; nenhuma vulnerabilidade nova foi introduzida. As políticas reais de audit do backend e frontend passaram sem exceções. Os resultados antigos de audit zero nas seções abaixo representam suas respectivas datas.

## Gate executável E14

Em 26/07/2026, `scripts/check-npm-audit.mjs` passou a bloquear toda vulnerabilidade `high` ou `critical` não registrada de forma específica. A política versionada em `npm-audit-exceptions.json` exige advisory ID, pacote, cadeia, severidade, justificativa, data da decisão, condição/data de revisão e responsável; exceções expiradas falham. O Dependency Review complementa a política sobre o delta de pull requests.

Não há exceção vigente. A exceção temporária de `GHSA-qwww-vcr4-c8h2` foi removida após a migração para `react-router@8.3.0`, primeira versão corrigida segundo o advisory oficial. Backend e frontend possuem zero vulnerabilidades no audit posterior. Nenhum `npm audit fix` foi executado.

## Revalidação L2.1

Em 15/08/2026, o gate detectou novos advisories altos em dependências transitivas: `ip-address@10.2.0` no backend e `nanoid@3.3.16` em ambos os lockfiles, além de `brace-expansion@5.0.8` no grafo de desenvolvimento. As faixas já declaradas permitiram atualização exclusivamente dos lockfiles para `ip-address@10.5.0`, `nanoid@3.3.18` e `brace-expansion@5.0.9`. Nenhuma dependência direta, override, exceção ou política de CI foi alterada; `npm audit` e o gate versionado voltaram a zero vulnerabilidades.

## Revalidação E15

Em 26/07/2026, `npm audit --json` e o verificador de política passaram para backend e frontend com zero vulnerabilidades e zero exceções. A inspeção dos lockfiles encontrou metadata de licença para todos os 347 pacotes do backend e 308 do frontend, sem marcador `UNKNOWN` ou `UNLICENSED`; isso é inventário, não um parecer jurídico nem um gate automatizado de compatibilidade. SBOM e política executável de licenças continuam no backlog.

ESLint, Prettier, `@eslint/js` e `globals` foram adicionados como dependências de desenvolvimento; o frontend também recebeu `eslint-plugin-react-hooks`. O audit após a atualização não introduziu novo advisory. Nenhuma dessas ferramentas integra o runtime da aplicação.

## Correção pós-E14 — React Router

Em 26/07/2026, o advisory oficial definiu o intervalo vulnerável `>=7.12.0, <8.3.0` e a primeira versão corrigida `8.3.0`. Como `react-router-dom` foi removido oficialmente na major 8, o frontend passou a depender diretamente de `react-router@8.3.0`; imports declarativos foram migrados para `react-router`. React 19.2.7 e Vite 8 já atendiam aos peers/baseline da versão. A árvore e o audit ficaram sem vulnerabilidades e sem exceção.

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
| `react-router`/`react-router-dom` 7.18.0 | bypass CSRF em modo RSC | TRACEFLOW usa SPA, mas a versão vulnerável continuava presente | migrado para `react-router@8.3.0`, primeira versão corrigida, com testes de rotas e build | CORRIGIDO |

Resultado final frontend após a correção pós-E14 e a revalidação E15: **0 vulnerabilidades** no `npm audit`; nenhuma exceção permanece para React Router.

## Política de atualização

- crítica de runtime aplicável: tratar imediatamente;
- alta de runtime aplicável: corrigir no ciclo corrente ou aceitar formalmente com mitigação;
- desenvolvimento/build: avaliar alcance e corrigir por patch/minor quando seguro;
- nenhuma major automática sem análise de API, testes e plano de rollback;
- lockfiles são obrigatórios; fontes esperadas são o registry npm e o repositório oficial do pacote;
- Dependency review é obrigatório em pull requests desde a E14. SBOM automatizada permanece como evolução futura.
