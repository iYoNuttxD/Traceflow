# Prompt de teste — campanha de caixa preta: RF08 (quadro Kanban), RF10 (cronograma) e RF35 (evolução por sprint)

> **Como usar este documento.** Ele é o enunciado completo da **campanha de testes de caixa preta**
> dos RF08, RF10 e RF35 na branch `joao-dev-v2`. Ela é deliberadamente diferente das três baterias
> anteriores (`RF10_RF35_PROMPT_TESTES.md`, `…_SEGUNDA_BATERIA.md`, `RF10_RF08_PROMPT_TERCEIRA_BATERIA.md`):
> aquelas eram majoritariamente **caixa branca** — invariantes derivados da leitura do código,
> bateria de mutação, metas de cobertura. Esta campanha não olha o código: os casos são projetados
> **somente a partir da especificação** (seção 0.1) com técnicas clássicas de caixa preta, e o
> veredito sai **somente do que as interfaces públicas devolvem** — resposta HTTP e tela. A
> sobreposição com testes existentes é esperada e não é problema: o valor está no desenho
> sistemático por requisito e no veredito por especificação, não em cobrir linhas.
>
> Leia as seções 0 a 2 antes de escrever qualquer caso; execute as fases 1 a 4 na ordem; encerre
> pelas seções 7 e 8. Cada fase é um commit próprio.

---

## 0. Regras de trabalho (invioláveis)

1. **Código de produção fechado durante o projeto e a execução dos casos.** O desenho parte da
   especificação; a execução observa as interfaces. Abrir `backend/src` ou `frontend/src` só é
   permitido **depois** de um caso falhar, para localizar o achado — e a leitura entra no registro
   do achado, nunca no desenho de casos novos.
2. **Oráculo é interface pública.** A prova de qualquer efeito é uma resposta HTTP ou uma leitura
   subsequente pela própria API (`GET` no quadro, no cronograma, no progresso) ou pela tela.
   **Nenhuma consulta direta ao banco** (`prisma.*` como oráculo é caixa branca). Exceção única e
   declarada: a **instrumentação de autenticação** dos testes de API (fixture de sessão, a mesma
   das suítes existentes) — autenticar não é o requisito sob teste.
3. **Setup pelos endpoints públicos.** Projeto, sprint, marco e tarefa dos casos são criados pelas
   rotas documentadas, nunca por factory de banco. O que a API não permite criar (ex.: sprint já
   `CONCLUIDA` sem passar pelo ciclo) é construído **pelo ciclo público** (criar → iniciar →
   concluir) — se o ciclo não permite chegar ao estado, o caso testa exatamente isso.
4. **Teste que falha achou defeito: registre e não corrija na campanha.** Bloco padrão de achado
   (Onde / Norma / Esperado / Observado / Reprodução / Consequência / Proposta), prefixo **CP-A**.
   Caso vermelho não entra no commit — a reprodução vive no relatório.
5. **Cada caso cita o requisito e a técnica** que o gerou (seção 1). Caso sem partição, limite,
   transição, regra de decisão ou passo de caso de uso identificável não entra: caixa preta sem
   técnica é teste ao acaso.
6. **Ambiente é do João.** A fase de UI roda no ambiente completo (backend + MySQL + seed) —
   comandos propostos e aval aguardado; atenção aos **dois MySQL na 3306**. A fase de API roda no
   banco de teste (`backend/.env.test`) sem tocar o ambiente de desenvolvimento.
7. **Evidência, não afirmação.** API: saída dos comandos colada. UI: captura por passo relevante
   do roteiro, incluindo **os dois extremos de dados** (projeto zerado e seed em escala).
8. **Idioma e registro.** Casos, roteiro e relatório em pt-BR. Os casos manuais usam o formato de
   caso de teste que o próprio TraceFlow adota no RF42 — título, pré-condições, passos, resultado
   esperado, status — para que a campanha sirva de ensaio do vocabulário do produto.
9. **Sem métricas de caixa branca.** Cobertura de código e mutação não são gates desta campanha
   (são das baterias). O gate daqui é **cobertura de especificação**: a matriz da Fase 4 mostra
   cada regra da seção 2 exercitada por pelo menos um caso, ou declara o porquê de não ser.

### 0.1 Especificação-oráculo e precedência

| Ordem | Fonte | Papel |
|---|---|---|
| 1 | Documento oficial do TCC, Cap. 3 (RF08 "organizar tarefas em quadro ágil"; RF10 "definir cronograma do projeto"; RF35 "exibir evolução por sprint") e Apêndice B (fluxo central) | o que cada requisito **é** |
| 2 | `TRACEFLOW_ROADMAP_INCREMENTAL.md`, cartão S1-04 (critérios A1–A6) e DoD comum §4 | critérios de aceite oficiais |
| 3 | ADRs vigentes como **regras de domínio publicadas**: ADR-011 > ADR-010 > ADR-009 | regra escrita = especificação; caixa preta pode (e deve) ler decisão publicada — o que ela não lê é implementação |
| 4 | `docs/api/API_CONTRATOS` (`docs/api/API_CONTRACTS.md`) e `docs/security/AUTHORIZATION_MATRIX.md` | contratos e papéis esperados nas interfaces |
| 5 | `docs/traceability/RF_TECHNICAL_MATRIX.md` | onde cada RF se manifesta (rotas e telas), sem abrir o código |

Divergência entre fonte e comportamento observado é **achado**, decidido pela precedência acima.

### 0.2 Comandos de verificação

```bash
cd backend && npx vitest run test/api/rf08-rf10-rf35-caixa-preta.test.js
```

```bash
cd backend && npm run lint && npm run format:check && npm test
```

Suíte completa rodada **duas vezes** com resultado idêntico ao encerrar a Fase 2. A fase de UI
tem os comandos do ambiente propostos ao João no início da Fase 3.

---

## 1. Técnicas e onde cada uma morde

| Técnica | Aplicação nesta campanha |
|---|---|
| **Partição de equivalência (PE)** | campos de sprint (nome, objetivo, datas, `milestoneId`), marco (título, prazo), movimentação (status válido/ inválido), progresso (sprint com/sem tarefas pontuadas) |
| **Análise de valor limite (VL)** | duração mínima de sprint; janela semiaberta (fim de A = início de B); teto de 100 tarefas por sprint (99/100/101); janela `from`/`to` do cronograma com `to` inclusivo em UTC; prazo de marco exatamente no início/fim de sprint |
| **Transição de estados (TE)** | máquina da sprint (4 estados × todas as transições, válidas e inválidas, mais `DELETE`); status da tarefa no quadro (6 transições válidas + mesma coluna) |
| **Tabela de decisão (TD)** | mover tarefa (existência × status válido × mesma coluna × sprint congelada); associar tarefa a sprint (mesmo projeto × congelada × teto); excluir marco (com/sem sprints) |
| **Caso de uso (CU)** | fluxo central do cronograma-quadro-evolução, na linha do Apêndice B: criar marco e sprint → associar tarefas → iniciar → mover no quadro → concluir → observar devolução ao backlog, conclusão do marco e evolução congelada |

---

## 2. Catálogo de casos obrigatórios

Identificador: `CP-<técnica>-<nn>`. Cada caso declara o RF. As colunas "Esperado" vêm da
especificação da seção 0.1 — se a execução divergir, é achado, não ajuste do esperado.

### 2.1 TE — máquina de estados da sprint (RF10)

Construir cada estado **pelo ciclo público** e tentar cada transição por `PATCH` de status:

| # | De | Para | Esperado |
|---|---|---|---|
| CP-TE-01 | PLANEJADA | EM_ANDAMENTO | aceita |
| CP-TE-02 | PLANEJADA | EM_ANDAMENTO com outra sprint já ativa no projeto | recusada (409; uma ativa por projeto — ADR-011 D06) |
| CP-TE-03 | PLANEJADA | CONCLUIDA | recusada (transição inválida) |
| CP-TE-04 | PLANEJADA | CANCELADA | aceita |
| CP-TE-05 | EM_ANDAMENTO | CONCLUIDA | aceita; tarefas não concluídas voltam ao backlog (observável no quadro — ADR-011 D07) |
| CP-TE-06 | EM_ANDAMENTO | CANCELADA | aceita; datas liberadas para nova sprint no mesmo período (ADR-010, nota D03) |
| CP-TE-07 | EM_ANDAMENTO | PLANEJADA | recusada |
| CP-TE-08 | CONCLUIDA | qualquer | recusada (registro imutável — ADR-010 D04) |
| CP-TE-09 | CANCELADA | qualquer | recusada |
| CP-TE-10 | qualquer | `DELETE /sprints/:id` | `405 SPRINT_DELETE_NOT_SUPPORTED` (sprint nunca é excluída) |
| CP-TE-11 | EM_ANDAMENTO (última do marco) | CONCLUIDA | marco conclui junto, observável em `GET` de marcos (ADR-011 D05) |

### 2.2 TD — mover tarefa no quadro (RF08)

Condições: **C1** tarefa existe; **C2** `toStatus` válido; **C3** destino ≠ coluna atual; **C4**
sprint da tarefa não congelada (ou tarefa sem sprint).

| # | C1 | C2 | C3 | C4 | Esperado |
|---|---|---|---|---|---|
| CP-TD-01 | N | – | – | – | `404` |
| CP-TD-02 | S | N | – | – | `400` com os status permitidos na mensagem |
| CP-TD-03 | S | S | – | N | `409 TASK_SPRINT_LOCKED`; coluna intacta no `GET` do quadro |
| CP-TD-04 | S | S | N | S | `400` "já está nesta coluna" |
| CP-TD-05 | S | S | S | S | `200`; o `GET` do quadro mostra a tarefa na coluna nova e as contagens ajustadas |
| CP-TD-06 | as 6 transições válidas de status (`A_FAZER↔EM_ANDAMENTO↔CONCLUIDO`, todas as direções) | | | | todas `200`, quadro coerente após cada uma (TE aplicada ao quadro) |

Nota da CP-TD-03: a congelada **vence** a mesma-coluna — mover para a própria coluna numa sprint
congelada também responde `409`, não `400` (o quadro congelado é somente leitura).

### 2.3 PE/VL — cadastro e janelas do cronograma (RF10)

| # | Caso | Esperado |
|---|---|---|
| CP-PE-01 | criar sprint sem `milestoneId` | recusada (obrigatório na criação — ADR-011 D02) |
| CP-PE-02 | criar sprint com marco de **outro projeto** | recusada |
| CP-PE-03 | criar sprint com nome já usado no projeto | recusada (nome único) |
| CP-PE-04 | criar sprint com nome usado em **outro projeto** | aceita (unicidade é por projeto) |
| CP-VL-05 | sprint com fim ≤ início (duração zero) | recusada |
| CP-VL-06 | sprint de exatamente 1 dia | aceita |
| CP-VL-07 | sprint B começando **no instante do fim** de A | aceita (janela semiaberta) |
| CP-VL-08 | sprint B sobrepondo A em 1 dia | recusada (409 sobreposição) |
| CP-VL-09 | sobreposição com sprint **CANCELADA** | aceita (cancelada libera as datas) |
| CP-PE-10 | marco com prazo fora de qualquer janela de sprint | aceito (prazo livre — ADR-011 D03) |
| CP-PE-11 | excluir marco **com** sprint apontando | `409 MILESTONE_HAS_SPRINTS` |
| CP-PE-12 | excluir marco **sem** sprints | aceita; some do `GET` |
| CP-VL-13 | associar a 100ª tarefa à sprint | aceita |
| CP-VL-14 | associar a 101ª | recusada (`409`, teto de 100) |
| CP-PE-15 | associar tarefa de **outro projeto** | recusada |
| CP-PE-16 | associar tarefa a sprint congelada | recusada |
| CP-VL-17 | `GET /projects/:id/schedule?from&to` com tarefa de deadline exatamente em `to` | entra no agregado (`to` inclusivo em UTC); no dia seguinte, fora |

### 2.4 PE/VL — evolução por sprint (RF35)

| # | Caso | Esperado |
|---|---|---|
| CP-PE-18 | progresso de sprint recém-iniciada com 4 tarefas, 1 concluída | planejado 4, concluído 1, percentual 25, instante de corte presente |
| CP-PE-19 | progresso de sprint **sem tarefas** | percentual **null**, nunca `0` (ausência ≠ zero) |
| CP-PE-20 | tarefa **adicionada após o início** | identificável como adição pós-planejamento na resposta |
| CP-PE-21 | tarefa **removida após o início** | planejado não encolhe (escopo original preservado) |
| CP-TE-22 | concluir a sprint e reconsultar o progresso **duas vezes** | congelado (`frozen`), valores idênticos entre as duas consultas, corte no encerramento |
| CP-PE-23 | burndown de sprint com tarefas pontuadas vs sem pontos | com pontos: série presente; sem: resposta declara a ausência (a UI mostra fallback textual) |

### 2.5 Autorização nas três interfaces (RF08/RF10/RF35 × matriz de papéis)

| # | Caso | Esperado |
|---|---|---|
| CP-TD-24 | perfil de leitura (VIEWER): `GET` quadro, cronograma e progresso | `200` nos três |
| CP-TD-25 | VIEWER: mover tarefa, criar/editar sprint, concluir marco | `403` em todos |
| CP-TD-26 | usuário **fora do projeto**: os mesmos `GET`s | negado (o código exato vem da `AUTHORIZATION_MATRIX.md`; divergência é achado) |

### 2.6 CU — fluxo central ponta a ponta (RF10 → RF08 → RF35)

**CP-CU-27**, um único caso encadeado, só por chamadas públicas: criar projeto → criar marco →
criar sprint vinculada → criar 3 tarefas e associá-las → iniciar a sprint → mover 2 tarefas até
`CONCLUIDO` no quadro → consultar progresso (2 de 3, 67%) → concluir a sprint → verificar no
quadro a tarefa restante de volta ao backlog → verificar o marco concluído → verificar o
progresso congelado → tentar mover a tarefa concluída remanescente (`409`). Cada seta com a
resposta observada anotada.

---

## 3. Fase 1 — Projeto dos casos (commit próprio)

Materializar a seção 2 em `docs/issues/RF08_RF10_RF35_CASOS_CAIXA_PRETA.md`: uma linha por caso
com **RF, técnica, entrada, esperado (com a fonte da seção 0.1 citada), nível (API/UI/ambos)** e
colunas vazias de resultado/veredito que as Fases 2–3 preenchem. Casos além dos obrigatórios são
bem-vindos se nomearem a técnica que os gerou. É proibido consultar código nesta fase — se o
esperado não puder ser derivado da especificação, a lacuna documental é registrada como achado
CP-A de documentação.

## 4. Fase 2 — Execução automatizada no nível da API (commit próprio)

Arquivo novo `backend/test/api/rf08-rf10-rf35-caixa-preta.test.js`, com a instrumentação de
sessão das suítes existentes (exceção declarada da regra 2) e **todo o resto pelos endpoints**:

- um `describe` por técnica, casos nomeados pelos IDs (`'CP-TE-08 sprint concluida e imutavel'`);
- setup pelo ciclo público (regra 3) — nada de `prisma.*.create` para as entidades sob teste;
- oráculo por resposta + `GET` subsequente (regra 2) — nada de `prisma.*.find*`;
- caso que exigir UI (fallback do burndown, filtro visual) é marcado `nível UI` no catálogo e
  fica para a Fase 3 — não simular UI na API;
- vermelho → achado registrado e caso fora do commit (regra 4).

Encerrar com os comandos da seção 0.2, saída colada, suíte completa duas vezes.

## 5. Fase 3 — Execução manual no nível da UI (ambiente do João)

Propor os comandos (backend, frontend, MySQL correto) e aguardar o aval. Roteiro no formato da
regra 8, cobrindo o que só a tela prova, nos **dois extremos de dados**:

1. **RF08** — quadro com colunas e contagens; arrastar tarefa; mover pelo diálogo de detalhes
   (Enter no cartão, seletor, quadro e diálogo refletindo); cartão de sprint congelada sem
   arrasto e com seletor travado; filtro por sprint com backlog fora; mensagem amigável ao
   tentar mover congelada.
2. **RF10** — criar/editar sprint e marco pelos formulários (erros de validação na tela: nome
   duplicado, datas invertidas, sobreposição); calendário com faixas, marco estendido até o fim
   da primeira sprint agrupada com `· prazo DD/MM`, abas Todos/Marcos/Sprints/Tarefas filtrando;
   navegação presa ao intervalo; "Mais ações" da sprint (iniciar/concluir/cancelar) refletindo a
   máquina de estados.
3. **RF35** — painel de evolução com planejado/concluído/percentual; burndown com pontos e
   fallback sem pontos; sprint encerrada falando no passado e estável ao renavegar.
4. **Fluxo central (CP-CU-27) pela tela**, de ponta a ponta, com captura por etapa.

Cada passo com resultado obtido e veredito; divergência vira achado CP-A com captura.

## 6. Fase 4 — Relatório e veredito por requisito

Nova seção **"Campanha de caixa preta"** em `RF10_RF35_RELATORIO_TESTES.md` (a linhagem absorve o
RF08 como a terceira bateria já fez): números (casos projetados/executados/aprovados por nível),
**matriz técnica × RF × casos**, achados CP-A no bloco padrão, veredito **por requisito**
(`APROVADO` / `APROVADO COM RESSALVAS` / `REPROVADO`, com uma frase de justificativa cada), o que
não foi executado e por quê. O catálogo da Fase 1 fica com as colunas de resultado preenchidas —
ele é o registro primário; o relatório resume.

---

## 7. Critérios de aceite

1. Catálogo com os 27+ casos obrigatórios, cada um com RF, técnica e esperado com fonte citada.
2. Nenhum caso desenhado com consulta a código; nenhuma asserção de API usando o banco como
   oráculo; setup das entidades sob teste 100% por endpoint público.
3. Fase 2 verde nos comandos da seção 0.2, duas vezes, com saída colada — exceto casos que
   acharam defeito, registrados como CP-A e fora do commit.
4. Roteiro da Fase 3 executado no ambiente completo com capturas nos dois extremos de dados —
   ou explicitamente pendente de aval, com o restante da campanha fechado.
5. Veredito por requisito emitido e justificado; matriz sem regra da seção 2 órfã.
6. Nenhuma linha de código de produção alterada pela campanha.

## 8. Checklist de DoD

- [ ] Fase 1: catálogo criado, casos obrigatórios + extras com técnica nomeada
- [ ] Fase 2: arquivo de API novo, verde 2×, setup e oráculo caixa-preta, saída colada
- [ ] Fase 3: comandos propostos, aval, roteiro executado com capturas (0 e escala)
- [ ] Fase 4: relatório com números, matriz, achados CP-A e veredito por RF
- [ ] Catálogo com resultados preenchidos; commits um por fase

---

## Anexo A — Armadilhas conhecidas desta campanha

1. **Estados terminais só se constroem pelo ciclo** (regra 3): uma sprint `CONCLUIDA` nasce de
   criar → iniciar → concluir — três chamadas, com as consequências públicas de cada uma
   (devolução ao backlog, marco concluído). O caso que "prepara" o estado já está testando.
2. **`.env.test` ausente → falhas por `429`; dois MySQL na 3306 → credencial "errada" que é banco
   errado.** Herdadas de todas as baterias.
3. **Datas da janela `from`/`to` são dia de calendário em UTC** — o limite do CP-VL-17 se monta
   com deadline `T00:00:00Z` do próprio dia `to`, não com horário local.
4. **A resposta de erro do módulo de tarefas historicamente expõe só `message`**; o `409` de
   sprint congelada expõe também `code` (`TASK_SPRINT_LOCKED`). Asserção de corpo por
   `toMatchObject`, nunca igualdade estrita — corpo com campos a mais não é defeito.
5. **CP-TE-02 exige duas sprints com janelas disjuntas** (a sobreposição recusaria antes da
   regra de sprint única) — o caso é sobre o estado, não sobre as datas.
6. **O quadro devolve as tarefas por coluna; a "mesma operação" do RF38 não é alvo desta
   campanha** — histórico/movimentações só entram como efeito observável quando um caso do RF08
   precisar deles, sem virar requisito extra.
7. **No roteiro de UI, dev server atravessado por commits embaralha estado de hooks** (React
   Refresh) — reiniciar o Vite e dar hard refresh antes de registrar qualquer achado de
   interação (lição da quinta iteração).
8. **Percentual `null` ≠ `0` no RF35** — asserção de API distingue os dois; na tela, o estado
   vazio tem texto próprio, não "0%".
