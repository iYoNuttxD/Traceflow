# Relatório — S203-F22: custo da página de gravação da sincronização

- **Data:** 13/10/2026
- **Enunciado:** [S203_F22_PROMPT_CORRECAO_CUSTO_DA_PAGINA.md](S203_F22_PROMPT_CORRECAO_CUSTO_DA_PAGINA.md),
  com os oito pontos ⚑ aprovados pelo João na recomendação.
- **Decisão:** [ADR-021](../architecture/ADR-021-GRAVACAO-POR-DIFERENCA.md).

## 1. Commits

| Fase | Commit | Conteúdo |
|---|---|---|
| 0 | `c25b74a` | ADR-021; contrato (`created` e `updated` do resumo); ADR-018 e runbook da integração |
| 1 | `679089a` | `src/shared/persistence/changed-fields.js`; `upsertMany` de PRs e issues por diferença; E1 do S2-03 com a nova contagem; testes F1-01 a F1-07 |
| 2 | `9a40eaa` | `syncObserved` das branches por diferença; testes F2-01 e F2-02 |
| 3 e 4 | commit de registro | ADR-021 ("Validação"), backlog, runbooks, delta ASVS do S2-03 e este relatório |

## 2. Antes e depois

**Instruções por transação** (código final, cliente envolvido pelo ADR-020):

| Cenário | Antes | Depois |
|---|---:|---:|
| Página de 100 PRs ou issues sem mudança | 306 | 6 |
| Página de 100 novos | 306 | 7 |
| Página com 5 itens mudados | 306 | 11 |
| Página com todos mudados | 306 | 106 |
| 300 branches novas | 908 | 9 |
| 300 branches sem mudança | 908 | 9 |

**Latência, pelo proxy do S2-03** (página de 100 PRs; detalhe no ADR-021):
- **Sem mudança:** 31 ms a 2,3 ms, 154 ms a 14,8 ms e 616 ms a 61 ms. Antes, 4,8 s a 14,7 ms e
  `P2028` a 17,6 ms.
- **Todos mudados:** cabe até cerca de 45 ms (5,02 s a 46,1 ms, no limite) e cai a 61 ms.
- **Branches a 10,6 ms:** 300 branches sem mudança em 153 ms. Antes, 150 branches já caíam pelo
  prazo.
- **Orçamento para o S2-08:** banco abaixo de 40 ms até a API.

## 3. Testes que nasceram vermelhos

| Fase | Vermelho | Motivo |
|---|---|---|
| 1 | F1-01 | 306 instruções onde se esperava até 8 (ou até 13 com 5 mudanças); `updated` contava os itens sem mudança |
| 1 | F1-02 e F1-03 | o valor novo chegava ao banco, mas `updated` contava os 3 itens, e os itens sem mudança eram regravados |
| 1 | F1-02 (mapper e rótulos) | a segunda gravação idêntica contava 1 atualizado |
| 1 | F1-05 | a página repetida contava o item duas vezes (`created` e `updated` em 2) |
| 1 | F1-07 | o módulo de comparação não existia |
| 2 | F2-01 | 908 instruções para 300 branches |

Teste de guarda, verde antes e depois: o F2-02, que fixa o comportamento das branches (visto,
desativada, padrão trocado, nova e reativada) e garante que a gravação por diferença não o mudou.

## 4. Desvios em relação ao prompt

1. **JSON canônico.**
   - Os rótulos de issue são objetos (`{id, name, color, description}`), e o MySQL reordena as
     chaves de objetos JSON ao gravar.
   - A comparação usa serialização com as chaves ordenadas, e as listas mantêm a ordem.
   - O prompt dizia só "JSON pela forma serializada".
2. **Módulo da comparação.** Ficou em `src/shared/persistence/changed-fields.js`, com a comparação,
   a seleção dos campos e a deduplicação da página (`lastByKey`).
3. **`isActive` das branches.** O `updateMany` em lote grava só o `lastSeenAt`. O `isActive` volta
   a `true` só na gravação individual da branch reativada, que é a única que muda esse campo.
4. **F1-05 nasceu vermelho pela contagem, não pelo `P2002`.** O `upsert` sequencial já absorvia a
   repetição, mas contava o item duas vezes.
5. **Teste instável fora do escopo.**
   - Na primeira suíte completa da Fase 1, o teste de concorrência do Kanban (`mvp-contracts`,
     "protege atualização concorrente do mesmo status") recebeu `[200, 200]`: os dois `PATCH` não
     se cruzaram.
   - Ele passou isolado em 3 de 3 e nas rodadas seguintes. A correção não toca nesse caminho.
   - O item S104-F16 já existia e estava como "provável encerramento". Foi atualizado com a
     ocorrência e a proposta de tornar o teste determinístico.

## 5. Verificação

| Item | Resultado |
|---|---|
| Suíte completa do backend, duas vezes | 2.301 verdes, idênticas nas duas rodadas; só a falha de ambiente `EPERM` de symlink (`storage.test.js`) |
| Gates do backend | `lint`, `format:check`, `architecture:check` e `security:secrets` verdes |
| Regressão do S2-03 | `s203-github-event-detection` (com o E1 atualizado), `s203-correcoes` (C3-01), `s203-bateria`, `github-multibranch`, `project-deletion-concurrency` e `projects-github-e9` verdes |
| Mutantes MP01–MP10 | 10 de 10 mortos (tabela abaixo) |
| Código de produção depois das mutações | intacto (`git status` vazio em `backend/src` e `backend/test`) |
| Coautoria | `git log --format='%h [%(trailers)]' 3271b2f..HEAD` sem nenhum trailer nos commits desta correção |

**Mutantes** (`s203-f22` de unidade e integração, `s203-github-event-detection` e
`github-multibranch`, com `--bail=1`):

| Mutante | Alteração | Morto por |
|---|---|---|
| MP01 | a comparação diz sempre "mudou" | E1 do S2-03 (segunda sincronização sem mudança) |
| MP02 | a comparação diz sempre "igual" | E4 do S2-03 (reabertura não chega ao banco) |
| MP03 | datas comparadas por referência | E1 do S2-03 |
| MP04 | `undefined` e `null` diferentes | F1-07 |
| MP05 | JSON comparado por referência | F1-07 |
| MP06 | os novos gravados um a um | F1-01 |
| MP07 | `updated` volta a contar todos os existentes | F1-01 |
| MP08 | a página não é deduplicada | F1-05 |
| MP09 | `lastSeenAt` das branches existentes não é atualizado | F2-02 |
| MP10 | a reativação não soma em `reactivationCount` | F2-02 |

## 6. Critérios de aceite

- [x] A página de PRs ou issues sem mudança não grava nada e faz até 8 instruções; cada item mudado
      custa uma instrução (F1-01).
- [x] Toda mudança de campo chega ao banco; item sem mudança não é regravado (F1-02, F1-03).
- [x] As transições do ADR-018 continuam detectadas e registradas na mesma transação (F1-06).
- [x] A sincronização de branches sem mudança faz até 10 instruções, com o mesmo comportamento
      (F2-01, F2-02).
- [x] O resumo mostra como atualizados só os itens que mudaram (F1-04).
- [x] O limite de latência medido está no ADR-021 e no runbook.
- [x] Mutantes MP01–MP10 mortos.
- [x] Suíte completa do backend verde duas vezes, exceto a falha de ambiente conhecida; gates verdes.
- [x] Nenhum commit novo com trailer de coautoria ou atribuição.

## 7. O que fica

- **Pior página a mais de 45 ms:** uma página de 100 itens todos mudados ainda passa do prazo. Na
  prática, isso só acontece na primeira sincronização depois de muitas mudanças e com o banco
  distante.
- **Resumo na tela do projeto:** depois de uma sincronização sem novidade, mostra "0 atualizados".
  Não há componente novo. Se o João quiser ver, é sincronizar duas vezes o projeto de
  demonstração, com o aval dele.
- **S104-F16:** tornar determinístico o teste de concorrência do Kanban.
