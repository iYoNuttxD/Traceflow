# S2 P7 — Dashboard Aggregate API e RF56

## 1. Baseline

- Branch inicial: `daniel-dev`; HEAD: `b6182dac37c36a0c930d96ecd1aff8565c3f248a` (P6).
- Worktree limpo no início da rodada. O banco de testes `traceflow_test` em localhost foi confirmado distinto do banco de desenvolvimento `traceflow`; os testes de API usaram o helper que força `NODE_ENV=test`.
- Node 22.23.3 e Prisma 6.12.0. Nenhum commit, push, migration, alteração de schema ou escrita no banco de desenvolvimento nesta rodada.

## 2. Scope

Entregues os endpoints de Dashboard agregado e catálogo público, com as sete views pedidas, contrato de filtros, estados, frescor e testes. Os cálculos continuam nos services e calculators P2–P6. RF55 visual, layout personalizado, novos indicadores e cache persistente estão fora de P7.

## 3. Dashboard aggregate architecture

`dashboard-view.catalog.js` define views e roteia cada ID para uma fonte; `dashboard.service.js` valida contexto e filtros, agrupa IDs por fonte, chama cada service necessário uma vez na request e compõe os `IndicatorResult` já calculados. Usa `Promise.allSettled` para preservar blocos locais diante de falha externa conhecida. GENERAL usa leituras atuais menores para I23/I28 e I53, mantendo seus calculators canônicos. Não há HTTP interno nem fórmula nova.

## 4. View catalog

| View | Seções | IDs | Leituras de grupo com período |
| --- | --- | --- | ---: |
| GENERAL | summary, sprint | I01, I23, I28, I61, I66, I53, I45 | 5 |
| GITHUB | activity, pullRequests, issues | I02, I04, I06, I09–I18, I73–I74 | 2 |
| FLOW | flow | I20–I25 | 1 |
| SPRINT | planning, history, scope | I36–I47, I71–I72 | 1 |
| TASK | tasks | I26–I35 | 1 |
| QUALITY | pullRequests, tests, defects, concentration | I06, I48–I60 | 2 |
| TRACEABILITY | coverage | I61–I67 | 1 |

GENERAL possui sete widgets. Não há duplicata por view. I03/I05 constam no catálogo público para possível seleção futura, sem widget padrão; I19 não é implementado e I68 segue fora dos indicadores.

## 5. Filter contract

`GET /api/projects/:projectId/indicators/dashboard` aceita `view`, o trio opcional `startDate`, `endDate`, `timeZone`, `sprintId` e `responsibleUserId`. Query é estrita. `requestedFilters` registra o pedido; cada resultado acrescenta `filterCompatibility` (`SUPPORTED`, `NOT_APPLICABLE`, `UNSAFE`) e `appliedFilters` booleano. Filtro inseguro não muda o valor e gera limitação; warning de view indica filtro pedido sem aplicação por qualquer indicador.

## 6. RF56

O filtro temporal funciona em indicadores EVENT compatíveis e preserva os relógios de cada service. Indicadores CURRENT_STATE mantêm valor e `period:null`, inclusive quando o usuário envia período. Sem período, EVENT retorna `UNAVAILABLE`/`PERIOD_REQUIRED`, enquanto CURRENT_STATE continua consultável. Não existe período público implícito de 30 dias. O controle visual do filtro ainda pertence a P8.

## 7. Period normalization

O período público é normalizado uma vez pela policy P2 para datas civis no fuso IANA e intervalo `[startInclusive,endExclusive)`. Os services aceitam o objeto normalizado, evitando normalização divergente. Um período UTC interno de um dia é usado apenas para extrair estados atuais de services mistos na ausência de período; seus resultados EVENT são descartados. FLOW e TASK limitam o intervalo a 366 dias para conter a série calculada pelo service compartilhado. Testes cobrem DST e os limites inclusivo/exclusivo em relógios distintos.

## 8. Sprint filter

`sprintId` precisa existir no projeto autorizado e não estar excluída; caso contrário, 404. Somente as fichas de Sprint que já aceitam esse recorte o aplicam. I47 mantém histórico de projeto. Sem filtro explícito, seleção de Sprint ativa e caso de múltiplas ativas seguem o service P5; o Dashboard preserva seus estados e limitações.

## 9. Responsible filter

`responsibleUserId` exige membership do projeto, inclusive inativa para referência histórica. Usuário de outro projeto recebe 404. Nenhum service atual oferece recorte responsável geral que preserve autoria/atribuição histórica de todas as fichas; por isso o filtro é validado e exibido, mas não aplicado. I02/I03/I05 recebem `UNSAFE` nesse filtro. Identidade anonimizada não expõe nome no contexto. Esta é limitação explícita, sem reatribuição por responsável atual.

## 10. Filter compatibility

Compatibilidade `SUPPORTED` deriva dos `supportedFilters` executáveis dos catálogos P2–P6. `NOT_APPLICABLE` cobre ausência de significado, como período em WIP atual. `UNSAFE` registra recortes semanticamente candidatos ou incorretos sem suporte seguro no service, como responsável em I02/I03/I05 e Sprint em I03/I20–I22. O payload comunica aplicação efetiva por ficha, sem supor que um filtro solicitado vale para a view inteira.

## 11. Partial failure isolation

Falha `ExternalServiceError` dos grupos GitHub/atividade vira placeholders `SOURCE_UNAVAILABLE` apenas nesses IDs, com warning; resultados locais sobrevivem. Erro inesperado em fonte local continua HTTP 500 observável. Testes exercitam ambos os caminhos. `viewState` é derivado sem sobrescrever `state` individual: `AVAILABLE`, `PARTIAL`, `NO_DATA` ou `UNAVAILABLE`.

## 12. Freshness

`generatedAt` e `freshness.local.generatedAt` indicam montagem local; `freshness.github` só vem dos resultados GitHub e mantém `sourceUpdatedAt`/`sourceSyncStatus`. Cada indicador conserva seu `asOf`, fonte, versão, limitação e horário próprios. O Dashboard não afirma que todas as fontes compartilham uma única atualização.

## 13. Catalog endpoint

`GET /api/projects/:projectId/indicators/catalog` retorna ID, categoria, título, descrição, unidade, temporalidade, relógio, filtros executáveis, compatibilidade, visualizações candidatas, RF, versão, fonte conceitual e views. Não expõe SQL, credenciais ou I68. Usa a mesma autorização de projeto que o Dashboard.

## 14. Performance

As chamadas de grupo por view constam na seção 4; são operações de leitura no nível de service, **não contagem de SQL**. As projeções de Traceability, Sprint e Quality permanecem compartilhadas dentro de cada service, sem chamada por indicador. GENERAL faz apenas cinco leituras de grupo e usa consultas atuais específicas para Tasks/Defects. Medição local em projeto de teste vazio, Node 22.23.3, sete requisições HTTP sequenciais, com período UTC de 01–20/09/2026:

| View | Tempo observado | JSON |
| --- | ---: | ---: |
| GENERAL | 5 ms | 5.168 bytes |
| GITHUB | 7 ms | 12.475 bytes |
| FLOW | 4 ms | 5.772 bytes |
| SPRINT | 3 ms | 9.331 bytes |
| TASK | 4 ms | 6.961 bytes |
| QUALITY | 6 ms | 11.665 bytes |
| TRACEABILITY | 3 ms | 5.061 bytes |

São medidas de smoke local, sem carga e sem cardinalidade representativa. O teste mantém limite de payload de 256 KiB por view vazia; listas/séries obedecem aos limites dos services de origem. Não houve instrumentação para afirmar número de consultas SQL.

## 15. Authorization/privacy

Os dois endpoints exigem sessão e membership ativa VIEWER+ no projeto. Projeto alheio ou excluído responde 404; ausência de sessão responde 401. Sprint e responsável de outro projeto são rejeitados. O catálogo não expõe detalhes de infraestrutura; nome de pessoa anonimizada não aparece no contexto. Não existe comparação ou ranking novo de pessoas.

## 16. Tests

`indicators-p7.test.js` cobre sete views, catálogo, GENERAL e blocos mistos sem período, janela/current-state, DST, limites temporais de múltiplos relógios, Sprint, membro histórico, query estrita, 401/404, falha externa parcial e erro local inesperado. `dashboard-view.test.js` cobre unicidade e existência dos IDs, limite da GENERAL, compatibilidade, catálogo sem I68 e derivação de estado. Regressões focadas P4/P6 passaram. Teste de payload mantém limite por view. Focados finais: 13/13 PASS. O caso adicional de bloco misto foi acrescentado após a cobertura completa; foi executado no gate focado final.

## 17. Gates

| Gate local | Resultado |
| --- | --- |
| Backend unit (Node 22) | PASS: 827/827 |
| Backend integration/API (Node 22) | PASS: 604; 5 skips preexistentes |
| Backend coverage (Node 22) | PASS: 1.431; 5 skips preexistentes; statements 91,56%, branches 84%, lines 94,1% |
| Backend lint, format, architecture | PASS |
| Frontend full e coverage (Node 22) | PASS: 1.231/1.231 em ambos; statements 83,87%, branches 78,41% |
| Frontend lint, format e build (Node 22) | PASS; build mantém avisos existentes de bundle grande/IIFE |
| Prisma validate e generate (Node 22) | PASS; sem migration |
| CI validation local | PASS: validador e 8/8 testes do validador |
| Secret scan | PASS: 572 arquivos |
| npm audit | PASS no limiar `high`: zero avisos altos/críticos; avisos moderados descritos abaixo |
| `git diff --check` | PASS |

Não houve execução de CI remota nem homologação visual nesta rodada. A primeira tentativa dos unitários sob sandbox falhou apenas por `listen EPERM`; a repetição autorizada com Node 22 passou. A cobertura inicial com Node 26 foi interrompida antes do resultado e substituída pelo gate em Node 22.

## 18. Documentation

Atualizados `docs/api/API_CONTRACTS.md`, `docs/indicators/S2_INDICATOR_CATALOG.md` e `docs/traceability/RF_TECHNICAL_MATRIX.md`. S2-04/S2-05 não foram marcados como concluídos.

## 19. Remaining limitations

- RF55 visual, controle RF56 no painel e homologação visual pertencem a P8.
- Filtro por responsável é aceito e validado, mas ainda não executável nas fontes existentes; filtros de Sprint semanticamente candidatos em I03/I20–I22 também permanecem `UNSAFE`.
- Indicadores EVENT sem período explícito exigem escolha de janela; séries e listas podem refletir histórico incompleto conforme limitações já publicadas por P2–P6.
- Medidas de tempo/tamanho são smoke em projeto vazio, não benchmark de produção; contagem de SQL não foi instrumentada.
- O audit npm identificou avisos **moderados preexistentes**: `qs` via Express/body-parser nas dependências de produção do backend (3 ocorrências no relatório) e `@vitest/mocker` nas dependências de desenvolvimento de backend/frontend (3 ocorrências em cada). Nenhum pacote foi adicionado ou atualizado em P7; não houve aviso alto/crítico. A correção de dependências fica em rodada própria.
