# Planning demo — UX e burndown

Status: implementação e gates automatizados aprovados localmente; homologação visual do ajuste
final do histórico de sessões aprovada. As demais superfícies do pacote anterior não foram
re-homologadas nesta rodada. Sem commit/push e sem alteração de dados de demonstração.

## 1. Sessões registradas

Problema: o histórico mantinha os filtros sempre expandidos, os registros reservavam uma linha
inteira para ações, arredondavam a duração para minutos e repetiam o intervalo início/fim nos
cartões de cronômetro. Com dez registros, a rolagem também deslocava os controles do diálogo.

Root cause: composição vertical fixa no conteúdo, grid dos registros com ações em uma segunda
linha, reutilização do formatador agregado e ausência de uma região rolável exclusiva para a lista.

Correção: filtros recolhíveis com quantidade de filtros aplicados, preservação do draft ao recolher,
cards compactos em duas linhas com duração e ações alinhadas à direita, áreas interativas de 44 px
e fallback `100vh` seguido de `100dvh`. O header, os filtros e a paginação permanecem fixos; somente
a lista possui rolagem interna, com barra fina e visível para descoberta, sem overflow horizontal.
As durações individuais preservam segundos (`5s`, `1min 15s`, `1h 1min 1s`) e o intervalo redundante
foi removido somente da apresentação dos cartões, sem alteração de DTO, domínio ou eventos
históricos.

A tentativa intermediária de lista integral foi revertida. Ela exigia buscar automaticamente todos
os lotes do servidor e seu custo crescia sem limite junto com o histórico. O estado final usa
paginação tradicional no servidor, com 50 eventos por requisição e os controles `← Anterior`,
`Página X de Y` e `Próxima →`. Abrir o histórico faz uma única leitura da página 1; trocar de página
faz somente a leitura solicitada; aplicar ou limpar filtros volta para a página 1. Requisições
anteriores são canceladas e respostas obsoletas não substituem o estado atual.

## 2. Cronograma

Problema: limitar o Contexto com altura própria evitava que seu conteúdo aumentasse o Calendário,
mas fazia os dois boxes terminarem em linhas inferiores diferentes no desktop.

Correção: no layout lado a lado, o Calendário dimensiona a linha e o Contexto ocupa exatamente a
mesma altura, sem usar um valor fixo em pixels. Somente os bodies de Mês/Dia preservam
`overflow-y: auto`, sem truncar Tasks, Marcos ou Sprints. No breakpoint em que os painéis ficam
empilhados, as alturas voltam a ser independentes e o Contexto mantém seu limite responsivo em
`dvh`.

## 3. Evolução da Sprint

Problema: o título da evolução aparecia no header do diálogo e era repetido no painel.

Correção: o header do diálogo é a única fonte visual do título. O painel começa pela informação de
fechamento do planejamento e conserva a região acessível `aria-label="Evolução da sprint ..."`.

## 4. Burndown

Regra encontrada: `Sprint.startedAt` é o baseline da execução e `Sprint.startDate` é a data nominal.
O planejamento e os pontos continuam vindos dos snapshots de `SprintTask`; os instantes de queima,
scope changes e congelamento terminal não foram simplificados.

Root cause: `sprint.burndown.calculator.js` enumerava o eixo sempre desde `startDate`. O DTO e o
gráfico apenas reproduziam a série incorreta recebida; não havia transformação frontend criando os
dias extras.

Before: uma Sprint nominalmente iniciada em 13/09, mas realmente iniciada em 16/09, recebia pontos
de 13/09 a 15/09 e uma linha ideal calculada sobre esse intervalo artificial.

After: quando `startedAt` existe, a série começa no seu dia UTC. Sprint `PLANEJADA` mantém a janela
nominal para a linha ideal, mas toda a linha real fica ausente (`remaining: null`) até o início.
Sprints operacionais legadas sem `startedAt` preservam o fallback nominal existente.

Regressão determinística (`4 + 6 + 12 = 22 pontos`):

| Data       | Ideal | Restante esperado | Restante retornado |
| ---------- | ----: | ----------------: | -----------------: |
| 16/09/2026 |  22,0 |                18 |                 18 |
| 17/09/2026 |  14,7 |                12 |                 12 |
| 18/09/2026 |   7,3 |                12 |                 12 |
| 19/09/2026 |   0,0 |                12 |                 12 |

Testes adicionados ou ajustados cobrem `startDate < startedAt`, igualdade entre as datas, Sprint
planejada sem linha real, Task concluída ao entrar, filtros recolhíveis com valores preservados,
histórico com dez registros, limites de 11, 50, 51, 100, 101 e 1.000 eventos, navegação completa
de 101 eventos em três páginas, contagem de requisições, reset de filtro e scroll, cancelamento ao
fechar e autoridade da requisição mais recente. Também cobrem os limites exatos de `0s` a `2h`,
composição independente do Cronograma e unicidade do heading de Evolução. A suíte existente mantém
cobertura de conclusão posterior, adição/remoção de escopo, Sprints concluída/cancelada, zero
pontos, snapshots legados e equivalência de timestamps com offset.

## Validação local

- Frontend: 92 arquivos e 1.158 testes aprovados; coverage aprovado com 81,86% statements.
- Backend unitário: 65 arquivos e 760 testes aprovados.
- Backend integração/API: 34 arquivos aprovados, 517 testes aprovados e 5 skips canônicos.
- Backend coverage: 99 arquivos aprovados, 1.277 testes aprovados e 5 skips canônicos; 91,47%
  statements.
- Lint, format check, build, architecture check e `git diff --check`: aprovados.
- Build preserva os avisos já existentes de chunks acima de 500 kB; não é erro do gate.

### Homologação visual

Classificação: `PASS` para o ajuste final do histórico de sessões.

A aplicação foi renderizada em uma sessão local autenticada nos temas Light e Dark e nas larguras
1440, 1280, 768 e 390 px, usando respectivamente alturas de 900, 800, 1024 e 844 px. A tarefa #18
forneceu seus 11 eventos existentes, sem criação ou alteração de dados de demonstração. Os estados
com múltiplas páginas foram validados deterministicamente pelos testes de componente com 51, 100,
101 e 1.000 registros.

Na revalidação, o diálogo permaneceu dentro do viewport, a lista manteve `overflow-y: auto`, barra
fina visível e nenhum overflow horizontal. Os controles exibiram `Página 1 de 1`, com anterior e
próxima corretamente desabilitados para os 11 eventos reais; em 390 px, a paginação reorganizou-se
em uma coluna e preservou alvos de 44 px. Os cartões continuaram exibindo `5s`, `6s`, `8s`, `12s` e
`31s` sem `0min`, sem o intervalo redundante e com duração/ações alinhadas.

O navegador foi restaurado ao tema Dark, à URL original e ao viewport padrão após a homologação.

Resultado: `TASK EFFORT HISTORY PAGINATION RESTORE — PASS LOCAL`.
