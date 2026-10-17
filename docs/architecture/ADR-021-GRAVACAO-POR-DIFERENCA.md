# ADR-021 — Gravação por diferença na sincronização GitHub

- **Estado:** aceita (S203-F22)
- **Data:** 13/10/2026
- **Responsáveis:** João Vitor S. Hernandes
- **Relação:** complementa o [ADR-018](ADR-018-GITHUB-EVENT-NOTIFICATIONS.md) (transições na
  transação da página) e o [ADR-020](ADR-020-PRAZO-DAS-TRANSACOES.md) (prazo próprio das
  transações)

## Contexto

A sincronização grava cada página do GitHub numa transação com o projeto travado (`SYNC_WRITE`).
O custo da transação crescia com o número de itens, não com o que mudou (medição de 13/10/2026,
Anexo B de `docs/issues/S203_F22_PROMPT_CORRECAO_CUSTO_DA_PAGINA.md`):
- **PRs e issues.** A página de 100 itens fazia 306 instruções: um `upsert` por item, com três
  instruções cada, haja ou não mudança. A cada sincronização, todas as páginas (`state: 'all'`) eram
  regravadas.
- **Branches.** Todas as branches iam numa única transação, com um `upsert` por branch: 3N + 8
  instruções.

Com o banco distante, a transação passava do prazo:
- a página de 100 PRs, a partir de cerca de 15 ms;
- 150 branches, já a 10,6 ms.

Desde o ADR-020, a falha é limpa, mas a sincronização para.

## Decisão

1. **Gravação por diferença em PRs e issues (D1).**
   - Na transação da página, uma leitura traz os itens existentes com todos os campos comparáveis.
   - Os novos vão num `createMany`.
   - Cada item que mudou recebe um `updateMany` por id, só com os campos que mudaram.
   - O `recordTransitions` do ADR-018 continua na mesma transação, com o mesmo estado anterior.
2. **Comparação (D2).**
   - Uma função pura compara campo a campo, com `undefined` como `null`, datas por instante e JSON
     pela forma serializada.
   - Rótulos em outra ordem contam como mudança, o que só regrava.
3. **Página deduplicada (D3).** Um `githubId` repetido na mesma página fica com a última ocorrência,
   para o `createMany` não falhar com chave duplicada.
4. **Branches (D4).**
   - Mesma gravação por diferença: `lastSeenAt` (e `isActive`) em lote para as observadas que já
     existem e `createMany` das novas.
   - Gravação individual só para as que mudaram `headSha` ou `isDefault` ou foram reativadas
     (`reactivatedAt` e `reactivationCount` + 1).
5. **Contador `updated` (D5).** O resumo da execução conta como `updated` só os itens que mudaram.
   A tela continua mostrando "X atualizados", agora com o número certo.
6. **Orçamento de latência (D6).**
   - A página sem mudança custa cerca de 6 instruções, e a pior página (todos os itens mudados),
     cerca de 106.
   - O limite até o banco passa a ser o da pior página. A seção "Validação" registra a medição.

## Alternativas consideradas

- **`INSERT … ON DUPLICATE KEY UPDATE` em SQL cru**, com uma instrução por página. Rejeitada:
  - `PullRequest` e `Issue` têm duas chaves únicas (`githubId` e `number`), o que torna o
    `ON DUPLICATE KEY` ambíguo;
  - o SQL cru perde o mapeamento do Prisma (`@updatedAt`, JSON, datas).
- **Páginas menores** (25 itens). Rejeitada: cada transação caberia, mas o custo continuaria de
  três instruções por item.
- **Comparar só o `updatedAtGithub`.** Rejeitada: confia no GitHub e não corrige linhas gravadas
  diferentes por versões anteriores.

## Consequências positivas

- A sincronização sem novidade praticamente não grava nada, e o custo deixa de crescer com o
  tamanho do repositório.
- A transação da página e a das branches cabem no prazo com o banco bem mais distante.
- O resumo diz quantos itens mudaram de fato.

## Consequências negativas

- **`updatedAt` parado:** o `updatedAt` de PR, issue e branch só muda quando algo muda. Nenhum
  código lê esse campo.
- **Comparação mantida à mão:** a comparação precisa acompanhar os campos gravados. Campo novo fora
  dela seria sempre gravado (seguro, mas caro) ou, se esquecido na leitura, comparado contra
  `undefined` e gravado sempre.
- **Contador `updated` muda de sentido:** os testes que o fixavam como total de existentes mudaram
  de expectativa.

## Impactos de segurança e privacidade

- Nenhum dado novo é lido nem gravado, e o escopo continua o do projeto travado.
- A transação mais curta reduz o tempo com o projeto travado (ASVS V15.4.x).

## Validação (13/10/2026)

Prisma 6.12.0, MySQL 8.1.0 local, banco de teste, cliente envolvido pelo ADR-020. Testes de
`s203-f22-gravacao-por-diferenca.test.js`.

**Instruções por transação.**

| Cenário | Antes | Depois |
|---|---:|---:|
| Página de 100 PRs ou issues sem mudança | 306 | 6 |
| Página de 100 novos | 306 | 7 |
| Página com 5 itens mudados | 306 | 11 |
| Página com todos mudados | 306 | 106 |
| 300 branches novas ou sem mudança | 908 | 9 |

**Latência, pelo proxy do S2-03** (página de 100 PRs):

| Latência efetiva | Antes, sem mudança | Depois, sem mudança | Depois, todos mudados |
|---|---:|---:|---:|
| 2,34 ms | 931 ms | 31 ms | 309 ms |
| 10,62 ms | 3.479 ms | 113 ms | 1.238 ms |
| 14,75 ms | 4.812 ms | 154 ms | 1.646 ms |
| 17,79 ms | `P2028` | 183 ms | 1.989 ms |
| 30,94 ms | — | 314 ms | 3.393 ms |
| 46,1 ms | — | 468 ms | 5.024 ms (no limite) |
| 61,11 ms | — | 616 ms | `TransactionDeadlineError` |

A coluna "antes" vem da seção 16 de `S2_03_RELATORIO_TESTES.md`, que mediu a página que regravava
todos os itens.

**Branches a 10,6 ms:**

| Branches | Antes | Depois (sem mudança) |
|---:|---|---:|
| 50 | 1.847 ms | 202 ms |
| 150 | `TransactionDeadlineError` aos 5,1 s | 146 ms |
| 300 | `TransactionDeadlineError` | 153 ms |

**Orçamento (D6).**
- A página sem mudança, que é o caso de toda sincronização sem novidade, leva menos de 1 s até
  61 ms.
- A pior página, com os 100 itens mudados, cabe nos 5 s até cerca de 45 ms (5,02 s a 46,1 ms) e
  cai a 61 ms.
- A recomendação para o S2-08 é manter o banco abaixo de 40 ms até a API, com folga sobre o limite
  da pior página.
