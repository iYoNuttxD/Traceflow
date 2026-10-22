# Mapa do reteste — S2-02: notificações de tarefa depois das correções (RF30, RF59)

Fase 1 da campanha de [S2_02_PROMPT_RETESTE_NOTIFICACOES.md](S2_02_PROMPT_RETESTE_NOTIFICACOES.md).
Liga cada correção, regra revista, linha do contrato, requisito ASVS e hipótese a um caso `RT-*` e
ao teste que o executa.

**Aval dos sete ⚑ em 10/10/2026 ("pode seguir"), com as recomendações:**
1. achados registrados sem correção, prefixo S202-R;
2. relatório novo (`S2_02_RELATORIO_RETESTE.md`) e nota no relatório anterior;
3. arquivos de teste novos `s202-reteste`;
4. a conta 9 se desativa pelo fluxo do aplicativo, com a senha digitada pelo João;
5. orçamento: lista ≤ 300 ms por página com 10.000 notificações; exportação ≤ 5 s com 5.000;
6. migration com nome adiantado só investigada;
7. roteiro manual no lugar do E2E.

**Anexos e cartão:** os três anexos têm os mesmos hashes da primeira campanha (`a2fa1bbe…`,
`e904fd62…`, `4c18dbbc…`). As três versões do cartão não mudaram (seção 0.2 do prompt anterior).

Arquivos desta campanha:
- Fase 2: `backend/test/api/s202-reteste.test.js`;
- Fase 3: `backend/test/integration/s202-reteste.test.js`;
- Fase 4: `backend/test/unit/s202-reteste.test.js`;
- Fase 5: `frontend/test/pages/Notifications.reteste.test.jsx`;
- Fase 7: roteiro manual.

## 1. Correções → verificação independente (bloco V)

| Caso | Correção | Teste da rodada anterior (não conta como prova) | Caso novo | Fase |
|---|---|---|---|---|
| RT-V-01 | A01 (`52100ec`, `d9ea88a`) | C2-01, C3-01 | 47 não lidas, `limit=10`, marcar e desmarcar no caminho | 2 e 7 |
| RT-V-02 | A02 (`da4df65`) | C4-01 | três `PUT` distintos e um igual ao inicial, 20 rodadas, pela API | 3 |
| RT-V-03 | A03 (`3aab6cd`) | C5-01, C5-02 | `enabledAt` gravado pela API; dois prazos na mesma execução | 3 e 7 |
| RT-V-04 | A04 (`2111706`) | NT-Z-02/H4, C6-02 | quatro estados de conta × dois RFs, pela API e pelo job | 2, 3 e 7 |
| RT-V-05 | A05 (`d20d90a`) | C7-01 | projeto ativo, deixado, excluído e restaurado; `visible` comparado com a central | 2 e 7 |
| RT-V-06 | A08 (`6fb4968`) | NT-J-09/H16 | inexistente, excluído e em purga; dry-run e apply; projeto válido sem vencida | 3 |
| RT-V-07 | A12 (`6fb4968`) | — | busca do nome no repositório; `APP_TIMEZONE` com deslocamento | 4 |
| RT-V-08 | A14 (`52076a4`) | C1-01, C1-02 (política) | os quatro fusos **pelo job**, `now` ±1 ms | 3 |
| RT-V-09 | O-2 (`d9ea88a`) | C3-02 | três cartões em sequência rápida | 5 e 7 |
| RT-V-10 | O-7 (`d9ea88a`) | C3-03 | 0, 1, 99 e 150 não lidas | 5 e 7 |
| RT-V-11 | A06, A09, A10, A13 (`e3da602`) | — | leitura dirigida dos documentos | 8 |

## 2. Casos novos (bloco N)

| Grupo | Casos | Fase |
|---|---|---|
| N-C cursor | RT-N-C-01..09 na API; RT-N-C-10 (desempenho e `EXPLAIN`) na integração | 2 e 3 |
| N-L `PUT` serializado | RT-N-L-01..05 | 3 |
| N-E `enabledAt` | RT-N-E-01..07 (E-04 na API) | 2 e 3 |
| N-A contas restritas | RT-N-A-01..04 na integração; RT-N-A-05 (ator restrito) na API | 2 e 3 |
| N-X exportação | RT-N-X-01 na API; RT-N-X-02 (volume) na integração; RT-N-X-03 e 04 na Fase 8 | 2, 3 e 8 |
| N-J job | RT-N-J-01, 02 e 04 na integração; RT-N-J-03 por inspeção na Fase 8 | 3 e 8 |
| N-P corte | RT-N-P-01..04 | 4 |
| N-U frontend | RT-N-U-01..09 em jsdom; N-U-05 também na Fase 7 | 5 e 7 |

## 3. Reauditoria dos testes alterados nas correções (bloco G)

| Caso | Teste alterado | Commit do teste | Regra que o apoia | Regra antes do código? |
|---|---|---|---|---|
| RT-G-02 | NT-Z-02/H4 | `2111706` | ADR-016 D3 revisto | sim (`e3da602`) |
| RT-G-03 | NT-J-09/H16 | `6fb4968` | runbook e `TASK_NOTIFICATIONS.md` (código 2) | sim (`e3da602`) |
| RT-G-04 | NT-J-05, NT-P-09 | `2111706` | tabela de exclusões revista | sim (`e3da602`) |
| RT-G-05 | contrato da exportação (`s202-notifications`) | `d20d90a` | ADR-016, "Impactos" | sim (`e3da602`) |
| RT-G-06 | "Carregar mais" e cartão ocupado (`Notifications.bateria`) | `d9ea88a` | cursor: ADR-016 D8 (`e3da602`). Ocupado por cartão: **nenhum documento do repositório antes do código**; só o ⚑2 do prompt de correções; o inventário de UI recebe "marcação por cartão" em `a15e44b`, depois | **não**, para o ocupado por cartão |
| RT-G-07 | tabelas de 16 → 32 combinações | `2111706` | tabela de exclusões revista | sim (`e3da602`) |
| RT-G-08 | regra de recuperação ("reativar não recupera") | doc corrigido em `2111706` | ADR-016 D3 e consequências; `TASK_NOTIFICATIONS.md` | a regra da Fase 0 estava errada e foi corrigida junto com o código |

## 4. Hipóteses → casos

| Hipótese | Casos | Fase |
|---|---|---|
| R1 métrica M1/M2 com quatro motivos | RT-N-A-04, RT-M-01, RT-M-03 | 3 e 8 |
| R2 relatório anterior com vereditos antigos | bloco O, bloco R | 8 |
| R3 keyset sem índice adequado | RT-N-C-10 | 3 |
| R4 base64url não canônico | RT-N-C-02 | 2 |
| R5 item desmarcado acima do cursor | RT-N-C-08 | 2 |
| R6 deadlock do `lockUser` | RT-N-L-02 | 3 |
| R7 relógios da API e do job | RT-N-E-06 | 3 e 8 |
| R8 `dueDateRange` perto de dia saltado | RT-N-P-01, RT-N-P-02 | 4 |
| R9 nome da migration | bloco A | 8 |
| R10 código 2 × código 1 de produção | RT-N-J-01 | 3 |
| R11 ponto do ☰ em alto contraste | RT-N-U-05 | 5 e 7 |
| R12 marcações fora de ordem | RT-N-U-03, RT-N-U-04 | 5 |
| R13 `visible` × central em estados de projeto | RT-N-X-01 | 2 |
| R14 N+1 na exportação | RT-N-X-02 | 3 |
| R15 frase de recuperação repetida | RT-G-08 | 8 |
| R16 `visible` sem descrição na exportação | RT-N-X-03 | 8 |
| R17 ator com exclusão pendente move tarefa | RT-N-A-05 | 2 |
| R18 tela com 1.000 notificações | RT-N-U-09 | 5 |

## 5. ASVS (bloco X) → casos

| Requisito | Casos |
|---|---|
| V2.2.1, V2.2.2, V15.3.5 | RT-N-C-01..05, RT-N-C-07 |
| V8.2.2, V8.3.1, V8.4.1 | RT-N-C-09, RT-V-05, RT-N-X-01 |
| V2.3.4 | RT-V-02, RT-N-L-01..03 |
| V14.1.1, V14.1.2, V14.2.4 | RT-V-04, RT-V-05, RT-N-E-04, RT-N-E-05, RT-N-X-04 |
| V15.1.3, V15.2.2 | RT-N-C-10, RT-N-X-02, RT-N-P-04 |
| V16.3.3 | RT-V-02, RT-N-L-01 |
| V16.5.3 | RT-V-06, RT-N-J-01 |
| V4.1.1, V3.5.1, V14.3.2 | cabeçalhos e CSRF nas rotas alteradas (Fase 2) |
| as demais linhas da primeira campanha | regressão das baterias (RT-G-01) |

## 6. Regressão (RT-G-01)

As baterias `s202-bateria` e `s202-correcoes` rodam inteiras ao fim das Fases 3 e 6, sem alteração de
esperado nesta campanha.
