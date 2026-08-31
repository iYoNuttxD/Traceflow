# Prompt de implementação — quinta iteração do design de sprints e marcos (RF10) e Kanban sem seletor no cartão (RF08)

> **Como usar este documento.** Ele é o enunciado completo da **quinta iteração do design de
> sprints e marcos** na branch `joao-dev-v2`, motivada pela avaliação visual de 31/08/2026. São três
> mudanças de UI, independentes entre si, cada uma em um commit próprio:
>
> 1. **Fase 1** — no calendário do cronograma, a barra de um marco que agrupa sprints passa a
>    alcançar, no mínimo, o fim da sprint agrupada que termina primeiro.
> 2. **Fase 2** — o painel "No mês exibido" troca os três blocos empilhados por três abas
>    (Marcos, Sprints, Tarefas) com contagem, no padrão visual de *segmented control*.
> 3. **Fase 3** — o cartão do Kanban perde o seletor de status; a troca de status por
>    teclado/toque muda para o painel de detalhes da tarefa.
>
> Nenhuma linha de backend muda. Nenhum contrato HTTP muda. Nenhuma regra de domínio muda — o
> ADR-011 permanece integralmente válido. Leia as seções 0 a 3 antes de abrir qualquer arquivo; as
> decisões da seção 2 já estão tomadas — o trabalho é executá-las, não rediscuti-las (os pontos
> abertos a veto estão marcados como tal). Encerre pela seção 9.

---

## 0. Regras de trabalho (invioláveis)

1. **Escopo fechado.** O que este documento não pede, não entra. Achado fora de escopo (bug,
   débito, ideia) vai para `docs/issues/TECHNICAL_BACKLOG.md`, não vira mudança aqui.
2. **Nada de backend.** As três fases são exclusivamente de `frontend/`. Se alguma parte parecer
   exigir mudança de API, a leitura está errada — pare e releia a seção 2. O endpoint de mover
   tarefa (`PATCH /tasks/:id/move`) continua sendo chamado exatamente como hoje.
3. **Módulo puro continua puro.** `schedule-calendar.js` não importa React, não faz I/O e não chama
   `new Date()` por conta própria — toda função alterada continua recebendo o que precisa por
   parâmetro.
4. **Teste consulta pelo papel acessível**, nunca por classe CSS ou ordem de DOM (`getByRole`,
   `getByLabelText`). Asserção de layout (largura de aba, cor de badge) não vira teste unitário:
   vira verificação visual da seção 7.
5. **Testes que codificam o comportamento antigo são reescritos às claras.** Os testes que hoje
   afirmam três títulos de bloco visíveis ao mesmo tempo no painel do mês, e os que movem tarefa
   pelo seletor do cartão do Kanban, **não estão falhando por defeito**: a falha deles é a
   especificação nova (seções 5.4 e 6.4). Reescreva-os citando este documento, sem apagar o que
   eles ainda provam.
6. **Sem comentários narrativos nos arquivos de `features/schedule`** — o registro atual desses
   arquivos é código limpo e o racional vive neste documento (decisão de 27/08/2026). Nos arquivos
   do Kanban, não escrever comentário novo; os comentários existentes só saem junto com o código
   que eles explicam (o bloco do seletor). `describe`/`it` em pt-BR, no registro dos arquivos já
   existentes.
7. **Ambiente é do João.** Qualquer comando de serviço (dev server, instalação) é proposto e
   aguarda aval. As suítes do frontend rodam sem banco — essas rode direto.
8. **Evidência, não afirmação.** Alegação de "verde" vem com a saída real do comando. Verificação
   visual vem com captura de tela nos cenários da seção 7.
9. **Os dois extremos de dados.** O produto é avaliado com dados mínimos **e** em escala. Toda
   verificação visual desta entrega cobre 0 itens, 1 item e 15+ itens — a régua das iterações
   anteriores.

### 0.1 Fontes normativas e precedência

| Ordem | Fonte | Papel aqui |
|---|---|---|
| 1 | Este documento (decisões da seção 2) | especificação da entrega |
| 2 | ADRs do repo: **ADR-011 > ADR-010 > ADR-009** | regras de domínio que a apresentação respeita (marco agrupa sprints via `Sprint.milestoneId`; prazo do marco é livre; cancelada fora do calendário) |
| 3 | `TRACEFLOW_CONTEXTO_ARQUITETURA.md` | transversais: acessibilidade, qualidade de teste |
| 4 | `docs/architecture/FRONTEND_STRUCTURE.md` | organização dos módulos `features/schedule` e `features/tasks` |

O estilo do CSS é o do próprio `global.css`: folha global de classes semânticas, cores em hex
literal, **sem tokens, sem utilitários, sem CSS custom properties novas**. Modificador segue o
padrão já existente (`calendar-day--fora`, `agenda-entry--atrasada`).

---

## 1. Problema (evidência de 31/08/2026)

**P1 — a barra do marco abandona a própria sprint no meio.** Marco agrupa sprints (ADR-011), e o
calendário desenha a barra dele da **primeira sprint agrupada até o prazo**
([schedule-calendar.js:114-141](../../frontend/src/features/schedule/components/schedule-calendar.js)).
Quando o prazo cai antes do fim da sprint, a barra corta a sprint pela metade: na captura, o
"[SEED] Marco de sprint aberta" (12/08 – 17/08) agrupa a sprint "sdsd" (12/08 – 21/08) — nos dias
18 a 21 a faixa da sprint continua e a barra do marco que a agrupa sumiu. A tela afirma um
agrupamento que o desenho não sustenta.

**P2 — o painel "No mês exibido" empilha três blocos.** Marcos, sprints e tarefas do mês são três
listas empilhadas com título ([ScheduleCalendar.jsx:443-471](../../frontend/src/features/schedule/components/ScheduleCalendar.jsx),
[schedule-calendar.js:450-523](../../frontend/src/features/schedule/components/schedule-calendar.js)).
Com o seed em escala (5 marcos + 3 sprints + 14 tarefas), chegar às tarefas exige rolar as duas
listas anteriores dentro do clamp do painel. A referência visual aprovada pelo João é um
*segmented control* com contagem (exemplo "Moldes de projeto (1) | Moldes de planilha (5)"),
adaptado à paleta do TraceFlow.

**P3 — o cartão do Kanban carrega um `<select>` de status.** Cada cartão termina num seletor
"A Fazer / Em Andamento / Concluído"
([KanbanBoard.jsx:72-89](../../frontend/src/features/tasks/components/KanbanBoard.jsx)). A decisão
de design é removê-lo do cartão. O seletor não é decorativo: o comentário no próprio código
registra que ele é a **única alternativa ao arrasto para teclado e toque** — o arrasto HTML5 é
exclusivo de mouse, `TaskForm` descarta `status` do payload e o painel de detalhes hoje só exibe
"Status atual" como texto ([TaskDetailsPanel.jsx:67-70](../../frontend/src/features/tasks/components/TaskDetailsPanel.jsx)).
Remover sem realocar deixaria o RF08 inoperável sem mouse.

---

## 2. Decisões de design (tomadas; executar como está)

### D1 — A barra do marco alcança o fim da sprint agrupada que termina primeiro

Regra de **apresentação**, na mesma função pura que já deriva o período do marco
(`milestonePeriods`): quando o marco agrupa ao menos uma sprint não cancelada, o fim da barra passa
a ser

```text
fim = max(prazo, menor fim entre as sprints agrupadas)
```

O início não muda (`min(início da primeira sprint, prazo)`), e o **prazo continua sendo o ponto**
sob o dia do `dueDate`. Assim a barra nunca termina antes do fim de ao menos uma sprint que ela
agrupa — se o prazo já alcança ou passa esse fim, nada muda.

> **Nota de fidelidade ao pedido (aberta a veto).** O pedido literal — "cada marco tem que ir até o
> final de ao menos 1 sprint quando ela estiver associada" — admite duas outras leituras, ambas
> rejeitadas aqui:
>
> 1. **Regra de domínio no backend** (validar `dueDate >= fim de alguma sprint agrupada`): isso
>    reverteria o ADR-011 D03, aceito há oito dias, que libertou o prazo do marco de qualquer
>    janela de sprint e removeu a família de erros `MILESTONE_DUE_DATE_*`. Reintroduzir o
>    acoplamento exigiria ADR-012, migração de dados do seed e o retorno do atrito que o D03
>    eliminou (editar janela de sprint voltaria a poder falhar por causa de marco). Se o João
>    quiser essa leitura, **este prompt não a cobre** — é outra entrega, com ADR próprio.
> 2. **Estender até o fim da última sprint**: o pedido diz "ao menos 1", que é garantia de mínimo.
>    A extensão mínima preserva ao máximo o significado visual do prazo; cobrir todas as sprints é
>    trocar a barra do marco por uma soma das faixas de sprint, que já estão desenhadas.
>
> O precedente que sustenta a leitura escolhida é o próprio início da barra: ele **já** é derivado
> da primeira sprint agrupada, sem que isso seja regra de domínio. O fim passa a ser derivado pelo
> mesmo princípio. `Milestone.dueDate` permanece exatamente o que o usuário digitou.

### D2 — Quando a barra passa do prazo, as superfícies textuais dizem o prazo

Com `fim > prazo`, o intervalo "12/08 – 21/08" sozinho esconderia o prazo real. Nas superfícies
textuais do marco — legenda do calendário, item de marco no painel do mês e `title` dos segmentos
da barra — entra o sufixo `· prazo DD/MM` **somente quando `fim !== prazo`**. O chip compacto do
marcador e o "Marco atual" de "Agora" não mudam (o tile já diz `Prazo DD/MM`).

### D3 — O painel do mês vira três abas com contagem

O painel "No mês exibido" mantém o título e a linha-resumo
(`agosto de 2026 · 5 marcos · 3 sprints · 14 tarefas`) e troca os três blocos empilhados por um
*tablist* com três abas — **Marcos, Sprints, Tarefas** — cada uma com a contagem num badge. Só o
conteúdo da aba ativa é renderizado; aba com zero itens continua clicável e mostra o texto vazio do
bloco (`Nenhum marco neste mês.` etc.).

- Aba inicial: **Marcos** (a ordem atual dos blocos é preservada).
- A aba ativa **persiste ao navegar entre meses** (estado local do componente; não vai para a URL).
- O rótulo visível da terceira aba é **"Tarefas"**; a precisão "com deadline" não se perde — vive
  no `title` da aba e no texto vazio do bloco.
- Semântica WAI-ARIA de abas com **seleção acompanhando o foco**: `role="tablist"` +
  `role="tab"`/`aria-selected`/`aria-controls` + um único `role="tabpanel"`; *roving tabindex*
  (ativa `tabIndex={0}`, demais `-1`); `ArrowLeft`/`ArrowRight` circulam, `Home`/`End` vão aos
  extremos, e mover o foco já ativa a aba.

### D4 — Estilo do segmented control: a referência, na paleta do TraceFlow

A referência é o par de pills com badge da captura enviada pelo João, transposta para os hex já
usados no `global.css` (nada de bege/verde da referência):

| Papel | Valor | Origem na paleta |
|---|---|---|
| Trilho (container) | `background: #eef1f7; border-radius: 999px; padding: 0.25rem` | família de `#f8fafc`/`#eef1f6` já usada em fundos apagados |
| Aba inativa | texto `#475467`, fundo transparente | tom de texto secundário existente |
| Aba ativa | fundo `#fff`, borda `1px solid #cfd6e4`, texto `#172033` | mesma borda/texto de `.calendar-month-item` |
| Badge inativo | fundo `#e2e7f0`, texto `#475467` | borda neutra existente |
| Badge da aba ativa | fundo `#e8eefc`, texto `#244aa5` | azul primário de `.project-section-nav-link-active` |
| Foco visível | `outline: 2px solid #244aa5; outline-offset: 2px` em `:focus-visible` | azul primário |

### D5 — O seletor sai do cartão; o caminho de teclado muda para o painel de detalhes

O `<select>` sai do `KanbanTaskCard` por inteiro (com o comentário que o explica). O cartão fica:
título, prioridade, `dl` de detalhes e os avisos de congelada/movendo. **A troca de status sem
mouse não morre: ela muda de lugar.** No `TaskDetailsPanel` — que abre por Enter/Espaço no cartão e
já é um `role="dialog"` totalmente acessível — a linha "Status atual" deixa de ser texto e vira o
mesmo seletor, ligado ao mesmo `moveTaskToStatus` da tela.

> **Nota (aberta a veto).** Se o João preferir a **remoção seca** (seletor some e nada entra no
> painel), o quadro passa a ser operável apenas por arrasto de mouse — regressão direta de
> acessibilidade sobre uma decisão deliberada registrada no código, contrária ao transversal de
> acessibilidade do projeto. Nesse caso a Fase 3 encolhe para "remover o bloco do seletor e
> reescrever os dois testes", e o desvio é registrado às claras em
> `docs/issues/TECHNICAL_BACKLOG.md` como pendência de caminho acessível para o RF08. **Sem aval
> explícito, vale a realocação descrita aqui.**

### D6 — Congelada e "Movendo..." valem no painel como valem no cartão

Sprint encerrada/cancelada é registro (ADR-010 D04): o seletor do painel fica `disabled` quando a
tarefa pertence a sprint congelada, com `title` explicando, e também enquanto a movimentação está
em voo. A mensagem de erro amigável de sprint congelada já existe em `moveTaskToStatus` e continua
valendo — o painel não inventa validação própria.

### Fora desta entrega (registrado, não implementado)

- Qualquer mudança de domínio, contrato ou banco (ver nota do D1).
- O quadro continua **sem** reordenação dentro da coluna e sem atalho de teclado direto no cartão.
- `MovementHistory`, filtros de sprint do Kanban e métricas ficam como estão.

---

## 3. Superfície de mudança

| Arquivo | Fase | O quê |
|---|---|---|
| `frontend/src/features/schedule/components/schedule-calendar.js` | 1 e 2 | `milestonePeriods` com fim estendido; sufixo de prazo em `milestoneWeekLayout`/`monthLegend` (via consumo) e `monthBlocks`; condição de "Início — marco" em `buildEvents`; `monthBlocks` ganha `rotulo`/`descricao` e perde `titulo` |
| `frontend/src/features/schedule/components/ScheduleCalendar.jsx` | 1 e 2 | sufixo de prazo na legenda; painel do mês com tablist |
| `frontend/src/styles/global.css` | 2 | classes `.calendar-month-tabs`, `.calendar-month-tab`, `.calendar-month-tab--ativa`, `.calendar-month-tab-count` |
| `frontend/src/features/tasks/components/KanbanBoard.jsx` | 3 | remoção do `<select>` e da prop `onChangeStatus` do cartão/quadro |
| `frontend/src/features/tasks/components/TaskDetailsPanel.jsx` | 3 | "Status atual" vira seletor de mover; props `onChangeStatus`, `frozen`, `moving` |
| `frontend/src/features/tasks/pages/KanbanScreen.jsx` | 3 | novo aramado do painel; `moveTaskToStatus` sincroniza `selectedTask` |
| `frontend/test/features/ScheduleScreen.test.jsx` | 1 e 2 | casos novos de extensão; reescrita das asserções do painel para abas |
| `frontend/test/pages/KanbanPage.test.jsx` | 3 | reescrita dos testes do seletor; casos novos do painel |

Nada além disso. `useScheduleData.js`, `SprintProgressPanel.jsx`, `SprintBurndownChart.jsx`,
`KanbanColumn.jsx`, `kanban-display.js`, `MovementHistory.jsx` e qualquer coisa de `backend/`
ficam intactos.

---

## 4. Fase 1 — Marco alcança o fim de uma sprint (commit próprio)

### 4.1 `milestonePeriods` ([schedule-calendar.js:114-141](../../frontend/src/features/schedule/components/schedule-calendar.js))

Hoje a função deriva `primeiro` (menor início entre as sprints do marco) e monta
`inicio = min(primeiro, prazo)` / `fim = max(primeiro, prazo)`. Passa a derivar também o menor fim:

```js
const fins = doMarco.map((sprint) => sprintDayRange(sprint).fim).filter((dia) => Boolean(dia));
const menorFim = fins.length ? fins.reduce((menor, dia) => (dia < menor ? dia : menor)) : null;
const alcance = menorFim && menorFim > prazo ? menorFim : prazo;
```

e o objeto devolvido usa `alcance` onde hoje usa `prazo` na composição do fim:

```js
inicio: primeiro < prazo ? primeiro : prazo,
fim: primeiro < alcance ? alcance : primeiro,
```

Invariantes que a implementação deve preservar (e os testes provar):

- `menorFim >= primeiro` sempre (o menor fim é fim de alguma sprint, que termina depois de
  começar), então `fim >= inicio` continua valendo sem cláusula extra;
- `prazo` segue exposto e **inalterado** — é o dado do `dueDate`;
- comparação de dias continua lexicográfica sobre ISO, a norma do módulo;
- marco sem sprint agrupada (`comTrilha: false`) não muda em nada: `fins` vazio → `alcance = prazo`.

A resolução de fim à meia-noite já mora em `sprintDayRange` (sprint que termina em `01/09 00:00`
pinta até 31/08) — a extensão herda isso de graça, sem código novo.

### 4.2 Quem consome `fim` e o que acontece com cada um

A extensão se propaga sozinha; o trabalho é **conferir**, não reimplementar:

- **Barra e tinta dos dias** (`milestoneWeekLayout`, `buildMonthGrid`): passam a cobrir até o fim
  estendido, com o canto arredondado no dia novo. O **ponto de prazo** continua no dia do `prazo`,
  agora possivelmente no meio da barra — é o desenho desejado.
- **`calendarBounds` não muda**: o fim estendido é fim de sprint não cancelada, que já pinta a
  grade e já entra nos limites de navegação. Nenhum mês novo é desbloqueado pela extensão.
- **`nowTiles`**: a janela do "Marco atual" (`inicio <= hoje <= fim`) alarga junto — coerente: um
  marco cuja sprint ainda corre é o marco atual.
- **`monthBlocks`/`monthLegend`**: o marco passa a ser listado também no mês que só o fim
  estendido alcança — coerente com a barra desenhada nele.
- **Sprint `CANCELADA` não estende nada**: `ScheduleCalendar` já filtra canceladas **antes** de
  chamar `milestonePeriods` ([ScheduleCalendar.jsx:50-55](../../frontend/src/features/schedule/components/ScheduleCalendar.jsx)).
  Não duplicar o filtro dentro da função — uma regra, um dono.

### 4.3 Ajustes textuais (D2) e o evento de início

- `milestoneWeekLayout`: no `titulo` dos segmentos/marcadores
  ([schedule-calendar.js:159](../../frontend/src/features/schedule/components/schedule-calendar.js)),
  acrescentar ` · prazo ${shortDate(periodo.prazo)}` quando `periodo.fim !== periodo.prazo`. O
  `texto` do chip compacto fica como está.
- Legenda ([ScheduleCalendar.jsx:355-359](../../frontend/src/features/schedule/components/ScheduleCalendar.jsx)):
  mesmo sufixo condicional após o intervalo.
- `monthBlocks`, item de marco: o meta com trilha vira
  `12/08 – 21/08 · prazo 17/08 · Atrasado · agrupa 1 sprint` (sufixo de prazo só quando difere).
- `buildEvents` ([schedule-calendar.js:313-323](../../frontend/src/features/schedule/components/schedule-calendar.js)):
  a condição do evento "Início — marco" troca `periodo.inicio !== periodo.prazo` por
  `periodo.inicio !== periodo.fim` — cobre o caso novo de prazo no dia do início com barra
  estendida. O evento de prazo não muda de dia nem de texto.
- `buildMonthGrid`, descrição acessível do dia
  ([schedule-calendar.js:232-241](../../frontend/src/features/schedule/components/schedule-calendar.js)):
  o ramo do início adota a mesma condição `periodo.inicio !== periodo.fim`, e o ramo do prazo
  passa a ser avaliado **antes** do ramo do início — num dia que é prazo e início ao mesmo tempo,
  anunciar o prazo vale mais.

### 4.4 O que NÃO muda na Fase 1

- `Milestone.dueDate`, contratos, `schedule.service`, seed — intocados.
- O ponto de prazo, a agenda do dia, "Próximos eventos" e o evento "Prazo do marco" — no mesmo dia
  de sempre.
- Marcos sem sprint agrupada — ponto simples, como hoje.

### 4.5 Testes (`ScheduleScreen.test.jsx`)

**Conferir sem reescrever:** os casos existentes usam prazo depois do fim da sprint (ex.: Sprint 1
de 03/08 com marco Fundação em 20/08) — para eles `alcance === prazo` e nada muda. Se algum
quebrar, a implementação está errada, não o teste.

**Acrescentar:**

1. *Extensão* — `milestonePeriods` com sprint 12/08 – 21/08 e marco `dueDate` 17/08:
   `fim === '2026-08-21'`, `prazo === '2026-08-17'`, `inicio === '2026-08-12'`.
2. *Prazo depois do fim* — `dueDate` 25/08 com a mesma sprint: `fim === '2026-08-25'` (extensão é
   no-op).
3. *Menor fim entre várias* — duas sprints (fins 15/08 e 28/08), `dueDate` 10/08:
   `fim === '2026-08-15'` — estende até a que termina primeiro, não até a última.
4. *Cancelada não estende* — na renderização da tela (o filtro é do componente): sprint ativa até
   15/08 + cancelada até 28/08, prazo 10/08 → legenda/painel mostram fim 15/08.
5. *Sufixo de prazo* — com extensão, a legenda exibe `· prazo 17/08`; sem extensão, o sufixo não
   aparece (asserção negativa).
6. *Ponto continua no prazo* — o dia 17/08 mantém `prazo do marco` na descrição acessível e o dia
   21/08 não ganha ponto.
7. *Fim à meia-noite* — sprint com `endDate: '2026-09-01T00:00:00'` e prazo 20/08: `fim ===
   '2026-08-31'`, e ▼ continua desabilitada em agosto (a extensão não desbloqueia setembro).
8. *Marco sem sprint* — `fim === prazo`, sem sufixo, como hoje (regressão).

Fixtures de data continuam **sem `Z`**, pelo motivo já registrado no arquivo.

**Commit sugerido:**
`feat(schedule): estende a barra do marco ate o fim da primeira sprint agrupada`

---

## 5. Fase 2 — Abas no painel "No mês exibido" (commit próprio)

### 5.1 `monthBlocks` ([schedule-calendar.js:450-523](../../frontend/src/features/schedule/components/schedule-calendar.js))

Os blocos deixam de carregar título pronto e passam a carregar rótulo de aba:

- sai `titulo` (`'Marcos (3)'`);
- entram `rotulo` (`'Marcos'`, `'Sprints'`, `'Tarefas'`) e, no bloco de tarefas,
  `descricao: 'Somente tarefas com deadline dentro do mês exibido.'` (os outros dois não têm
  `descricao`);
- `chave`, `vazio`, `itens` e `resumo` ficam como estão. A contagem da aba é `itens.length` — não
  duplicar o número no dado.

O único consumidor de `titulo` é o painel do `ScheduleCalendar`; nenhum outro arquivo o lê.

### 5.2 Componente ([ScheduleCalendar.jsx:443-471](../../frontend/src/features/schedule/components/ScheduleCalendar.jsx))

Estado e semântica, no padrão de D3:

```jsx
const [abaAtiva, setAbaAtiva] = useState('marcos');
const abasRef = useRef({});
const blocoAtivo = noMes.blocos.find((bloco) => bloco.chave === abaAtiva) ?? noMes.blocos[0];

const ativarAba = (chave) => {
  setAbaAtiva(chave);
  abasRef.current[chave]?.focus();
};

const teclasDeAba = (event) => {
  const ordem = noMes.blocos.map((bloco) => bloco.chave);
  const atual = ordem.indexOf(blocoAtivo.chave);
  if (event.key === 'ArrowRight') ativarAba(ordem[(atual + 1) % ordem.length]);
  else if (event.key === 'ArrowLeft') ativarAba(ordem[(atual + ordem.length - 1) % ordem.length]);
  else if (event.key === 'Home') ativarAba(ordem[0]);
  else if (event.key === 'End') ativarAba(ordem[ordem.length - 1]);
  else return;
  event.preventDefault();
};
```

Marcação — o `h2`, a linha-resumo e a classe `.calendar-month-panel` (com seu clamp e o pareamento
de altura do desktop) permanecem; o miolo muda:

```jsx
<div
  className="calendar-month-tabs"
  role="tablist"
  aria-label="Conteúdo do mês exibido"
  onKeyDown={teclasDeAba}
>
  {noMes.blocos.map((bloco) => (
    <button
      key={bloco.chave}
      ref={(no) => {
        abasRef.current[bloco.chave] = no;
      }}
      type="button"
      role="tab"
      id={`calendar-month-tab-${bloco.chave}`}
      aria-selected={bloco.chave === blocoAtivo.chave}
      aria-controls="calendar-month-tabpanel"
      tabIndex={bloco.chave === blocoAtivo.chave ? 0 : -1}
      title={bloco.descricao}
      className={`calendar-month-tab ${
        bloco.chave === blocoAtivo.chave ? 'calendar-month-tab--ativa' : ''
      }`.trim()}
      onClick={() => setAbaAtiva(bloco.chave)}
    >
      {bloco.rotulo}
      <span className="calendar-month-tab-count">{bloco.itens.length}</span>
    </button>
  ))}
</div>
<div
  className="calendar-month-panel"
  role="tabpanel"
  id="calendar-month-tabpanel"
  aria-labelledby={`calendar-month-tab-${blocoAtivo.chave}`}
  tabIndex={0}
>
  {blocoAtivo.itens.length === 0 ? (
    <p className="calendar-month-empty">{blocoAtivo.vazio}</p>
  ) : (
    <ul className="calendar-month-items">…itens do blocoAtivo, como hoje…</ul>
  )}
</div>
```

O `tabIndex={0}` do tabpanel existe porque a lista não tem elemento focável — sem ele, Tab a partir
da aba pularia o conteúdo. Os `h3` de bloco saem; um único `tabpanel` no DOM, rotulado pela aba
ativa. Trocar de mês **não** reseta `abaAtiva`; a contagem dos badges se recalcula sozinha porque
`noMes` já depende do mês exibido.

### 5.3 CSS (`global.css`, junto de `.calendar-month-summary`, linha ~2248)

Exatamente a tabela do D4:

```css
.calendar-month-tabs {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0 0 0.85rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: #eef1f7;
}

.calendar-month-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: #475467;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease,
    border-color 0.2s ease;
}

.calendar-month-tab:hover {
  color: #172033;
}

.calendar-month-tab:focus-visible {
  outline: 2px solid #244aa5;
  outline-offset: 2px;
}

.calendar-month-tab--ativa {
  border-color: #cfd6e4;
  background: #fff;
  color: #172033;
}

.calendar-month-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: #e2e7f0;
  color: #475467;
  font-size: 0.72rem;
  font-weight: 800;
}

.calendar-month-tab--ativa .calendar-month-tab-count {
  background: #e8eefc;
  color: #244aa5;
}
```

Não tocar em `.calendar-month-panel`, `.calendar-month-item*` nem no bloco de pareamento
`@media (min-width: 961px)` — o teto e a rolagem do painel continuam os mesmos, agora aplicados a
uma lista por vez.

### 5.4 Testes (`ScheduleScreen.test.jsx`)

**Reescrever (codificam os três blocos empilhados — regra 5):** as asserções
`getByRole('heading', { name: 'Marcos (10)' })` e semelhantes (linhas ~949-1082) partem do
pressuposto de que os três blocos são visíveis ao mesmo tempo. Reescrever consultando por papel de
aba — `getByRole('tab', { name: 'Marcos 10' })` (o nome acessível concatena rótulo e badge; conferir
com `logRoles` na primeira rodada) — e, para conteúdo de sprint/tarefa, **ativar a aba antes** de
afirmar o item. O caso unitário de `monthBlocks` (linhas ~516-558) troca `titulo` por
`rotulo`/`itens.length`.

**Acrescentar:**

1. *Estrutura de abas* — um `tablist` com três `tab`; "Marcos" inicia selecionada
   (`aria-selected="true"`); painel único com `aria-labelledby` da ativa.
2. *Troca por clique* — clicar "Tarefas" mostra os deadlines e esconde os marcos
   (`queryByText` negativo).
3. *Troca por teclado* — foco na aba ativa, `ArrowRight` ativa "Sprints" e move o foco
   (`toHaveFocus()`); `Home`/`End` nos extremos.
4. *Aba vazia* — mês com marcos e sem tarefas: aba "Tarefas 0" clicável exibindo
   `Nenhuma tarefa com deadline neste mês.`.
5. *Aba sobrevive à navegação de mês* — ativar "Sprints", navegar ▼, painel continua na aba
   "Sprints" com a contagem do mês novo.

**Commit sugerido:**
`feat(schedule): troca os blocos do painel do mes por abas com contagem`

---

## 6. Fase 3 — Kanban sem seletor no cartão (commit próprio)

### 6.1 `KanbanBoard.jsx`

- Remover o `<select>` do `KanbanTaskCard` (linhas ~72-89) **com** o comentário que o precede — o
  código que ele explica deixa de existir.
- Remover a prop `onChangeStatus` do cartão e `onChangeTaskStatus` da assinatura do `KanbanBoard`.
- `bloqueado` continua existindo para `draggable`; o comentário do congelamento (linhas ~23-26)
  perde a menção ao seletor — ajustar a frase, não apagar a regra.
- O rótulo "Sprint congelada" e o "Movendo..." do cartão ficam.

### 6.2 `TaskDetailsPanel.jsx`

Novas props `onChangeStatus`, `frozen` e `moving`. A linha "Status atual" (linhas ~67-70) vira o
controle de mover, com o mesmo nome acessível que o quadro usava — a promessa de acessibilidade
muda de endereço, não de texto:

```jsx
<div>
  <dt>Status atual</dt>
  <dd>
    <select
      aria-label={`Mover a tarefa ${task.title}`}
      value={task.status}
      disabled={frozen || moving}
      title={
        frozen ? 'A sprint desta tarefa está congelada — o status é registro do período.' : undefined
      }
      onChange={(event) => onChangeStatus(task, event.target.value)}
    >
      {KANBAN_COLUMNS.map((column) => (
        <option key={column.status} value={column.status}>
          {statusLabels[column.status]}
        </option>
      ))}
    </select>
  </dd>
</div>
```

`KANBAN_COLUMNS` entra no import de `kanban-display.js`, que o arquivo já usa. O estilo do
`<select>` é o nativo dos formulários do `global.css` — sem classe nova; se o alinhamento dentro do
`dl` pedir ajuste, é caso para a verificação visual antes de qualquer CSS.

### 6.3 `KanbanScreen.jsx`

- Aramado do painel ganha as três props:

```jsx
<TaskDetailsPanel
  task={selectedTask}
  deleting={deletingTaskId === selectedTask?.id}
  moving={movingTaskId === selectedTask?.id}
  frozen={Boolean(selectedTask?.sprintId) && frozenSprintIds.has(selectedTask.sprintId)}
  onChangeStatus={moveTaskToStatus}
  …demais props como hoje…
/>
```

- `moveTaskToStatus` passa a sincronizar o painel aberto — hoje ele atualiza o quadro e deixa
  `selectedTask` para trás, o que manteria o seletor do painel no status antigo após o sucesso:

```jsx
setBoard((currentBoard) => updateBoardWithMovedTask(currentBoard, movedTask));
setSelectedTask((current) =>
  current && String(current.id) === String(movedTask.id) ? { ...current, ...movedTask } : current
);
```

- A remoção de `onChangeTaskStatus` do `<KanbanBoard …>` completa a fase. O caminho do arrasto
  (`handleColumnDrop → moveTaskToStatus`), o histórico de movimentação (RF38) e a recusa amigável
  de sprint congelada não mudam.

### 6.4 Testes (`KanbanPage.test.jsx`)

**Reescrever (codificam o seletor no cartão — regra 5):**

| Teste atual | Situação | Reescrita |
|---|---|---|
| move pelo `combobox` `'Mover a tarefa Da sprint'` (linha ~311) | o cartão não terá mais combobox | abrir o cartão (clique ou Enter), mover pelo combobox do diálogo, afirmar a chamada de API e a coluna nova |
| `combobox` de tarefa congelada desabilitado (linha ~326) | idem | abrir o diálogo da tarefa congelada e afirmar `toBeDisabled()` + `title` no combobox do painel |

**Acrescentar:**

1. *Cartão limpo* — `within(cartao).queryByRole('combobox')` é `null` (escopar ao cartão: a página
   tem outros comboboxes em filtros e histórico).
2. *Caminho de teclado completo* — Enter no cartão abre o diálogo, `selectOptions` no combobox
   move a tarefa, o diálogo reflete o status novo (prova da sincronização de `selectedTask`).
3. *Movendo em voo* — com a movimentação pendente, o combobox do painel fica `disabled`.

**Commit sugerido:**
`refactor(kanban): move a troca de status do cartao para o painel de detalhes`

---

## 7. Verificação visual (obrigatória, com captura)

Dev server proposto ao João (regra 7). Matriz mínima — cada célula com captura:

| Cenário | Desktop (≥ 961px) | 375px (mobile) |
|---|---|---|
| Marco com prazo no meio da sprint (seed: "Marco de sprint aberta" 17/08 × "sdsd" até 21/08) | barra segue até 21/08 com canto arredondado; ponto de prazo em 17/08 no meio da barra; legenda com `· prazo 17/08` | grade íntegra |
| Marco com prazo depois do fim da sprint | desenho idêntico ao de hoje, sem sufixo de prazo | — |
| Marco sem sprint agrupada | ponto simples, como hoje | — |
| Painel do mês: seed em escala (5+ marcos, 3 sprints, 14 tarefas) | três abas com badge; lista da aba rola dentro do clamp; trilho não quebra linha | abas cabem na largura; painel íntegro |
| Painel do mês: 0 itens numa aba / mês vazio | aba `0` clicável com texto vazio; resumo "nada no calendário" | — |
| Painel do mês: 1 item por aba | sem barra de rolagem sobrando | — |
| Foco de teclado nas abas | anel de foco `#244aa5` visível; setas circulam | — |
| Kanban: 0, 1 e 15+ tarefas | cartões sem seletor, altura menor e alinhada | colunas íntegras |
| Kanban: diálogo de detalhes | "Status atual" como seletor alinhado no `dl`; mover atualiza quadro e diálogo | diálogo íntegro |
| Kanban: tarefa de sprint congelada | seletor do diálogo desabilitado com `title`; rótulo no cartão | — |

---

## 8. Critérios de aceite

1. Nenhuma barra de marco termina antes do fim da sprint agrupada que termina primeiro; com prazo
   além desse fim, o desenho de hoje se preserva pixel a pixel.
2. O ponto e o evento de prazo permanecem no dia do `dueDate`; superfícies textuais exibem
   `· prazo DD/MM` exatamente quando fim e prazo diferem.
3. Sprint cancelada não estende barra, e a extensão não desbloqueia mês novo na navegação.
4. O painel do mês opera como tablist: três abas com contagem, seleção acompanhando o foco, setas e
   `Home`/`End` funcionando, painel único rotulado pela aba ativa, aba vazia utilizável, aba ativa
   preservada ao trocar de mês.
5. O visual do segmented control usa a paleta da tabela do D4 — nenhuma cor nova fora dela.
6. Nenhum `combobox` dentro de cartão do Kanban; o diálogo de detalhes move a tarefa com o mesmo
   nome acessível de antes, respeita congelada/movendo e reflete o status novo sem reabrir.
7. Arrasto, histórico de movimentações e mensagens de erro do quadro inalterados.
8. Testes reescritos citados nominalmente nas mensagens de commit; nenhuma asserção antiga ainda
   válida foi perdida.
9. Suítes, lint, format e build verdes nos comandos da seção 9, com saída colada; cobertura acima
   dos limiares atuais do frontend, sem baixá-los.
10. `git diff` de `backend/` vazio.

---

## 9. Comandos de verificação (evidência colada no encerramento)

```bash
cd frontend && npm run lint && npm run format:check && npm run build && npm test
```

```bash
cd frontend && npm run test:coverage
```

Rodar a suíte **duas vezes** — resultado idêntico (nenhum teste novo pode depender de relógio ou
ordem; `hoje` entra por prop, como os testes atuais já fazem).

---

## 10. Registro documental

- **Nenhum ADR novo.** As três fases são apresentação; `dueDate`, contratos e regras do ADR-011
  ficam intactos. Se o João vetar o D1 em favor da regra de domínio, isso vira ADR-012 + entrega
  própria — fora deste prompt.
- `docs/traceability/RF_TECHNICAL_MATRIX.md`: na linha do **RF08**, a coluna de componentes cita
  `KanbanScreen/Board` — acrescentar `TaskDetailsPanel` se a convenção da linha listar onde o
  fluxo acontece. Conferir a linha do **RF10**; só editar se ela afirmar o painel de blocos ou o
  desenho antigo da barra.
- Relatórios e mapas de teste já publicados em `docs/issues/` são registro histórico — não editar.
- Achados fora de escopo → `docs/issues/TECHNICAL_BACKLOG.md`, um por linha, com arquivo e uma
  frase. Se o veto da remoção seca (D5) for exercido, registrar lá a pendência de acessibilidade.

## 11. Checklist de DoD

- [ ] Fase 1: `milestonePeriods` com `alcance`, invariantes preservadas, 8 casos de teste novos
- [ ] Fase 1: sufixo `· prazo DD/MM` na legenda, no painel do mês e no `title` dos segmentos —
      somente quando difere
- [ ] Fase 1: condição de início por `inicio !== fim` em `buildEvents` e `buildMonthGrid`, com o
      ramo do prazo avaliado primeiro na descrição do dia
- [ ] Fase 2: `monthBlocks` com `rotulo`/`descricao`, sem `titulo`; tablist completa com roving
      tabindex e seleção no foco
- [ ] Fase 2: CSS do D4 aplicado sem cores fora da tabela; asserções antigas migradas para
      `getByRole('tab', …)`
- [ ] Fase 3: cartão sem seletor; diálogo com seletor acessível; `selectedTask` sincronizada no
      sucesso do move
- [ ] Fase 3: dois testes reescritos + três novos; queries escopadas ao cartão/diálogo
- [ ] Matriz visual da seção 7 completa, capturas anexadas, extremos de dados incluídos
- [ ] Comandos da seção 9 verdes, saída colada, suíte rodada duas vezes
- [ ] `RF_TECHNICAL_MATRIX.md` conferida; backlog alimentado; `backend/` intocado
- [ ] Três commits nos moldes sugeridos

---

## Anexo — Armadilhas conhecidas desta entrega

1. **`menorFim`, não `maiorFim`.** Reduzir pelo maior fim estende a barra até a última sprint e
   viola o "ao menos 1" do D1 — e nenhum teste de marco com uma sprint só pega o erro. O caso 3 da
   seção 4.5 existe para isso.
2. **Não refiltrar `CANCELADA` dentro de `milestonePeriods`.** O chamador já entrega a lista
   filtrada; duplicar o filtro esconderia o dia em que alguém passar a lista errada.
3. **`fins` pode ser vazio com `doMarco` não vazio** (sprint sem data válida —
   `sprintDayRange` devolve `{inicio: null}`): o `filter(Boolean)` antes do `reduce` é obrigatório,
   ou o `reduce` de array vazio lança.
4. **O nome acessível da aba concatena rótulo e badge** (`'Marcos 10'`). Asserções com
   `{ name: 'Marcos' }` exato falham; use o nome completo ou regex `/^Marcos/`.
5. **`getByRole('heading')` do painel morre na Fase 2** — as asserções antigas de
   `Marcos (N)`/`Sprints (N)` são de aba agora; procurar heading vai achar só o `h2` do card.
6. **Um único tabpanel no DOM.** Renderizar os três painéis com `hidden` quebra os `queryByText`
   negativos dos testes novos; o desenho é conteúdo condicional, painel único.
7. **`abasRef` é mapa de refs por chave** — ref callback, não `useRef` por aba dentro do `map`
   (hook em loop é erro de lint).
8. **A página do Kanban tem vários comboboxes** (filtros do histórico). Teste de "cartão limpo" e
   de mover **escopado** com `within(...)` ao cartão/diálogo, nunca `getByRole('combobox')` global.
9. **Sem a sincronização de `selectedTask`, o defeito é invisível ao olho** — o quadro atualiza
   atrás do diálogo e o seletor do painel volta ao status antigo. O caso 2 da seção 6.4 é o
   guarda-corpo.
10. **`stopPropagation` do diálogo já existe no container** (`task-detail-modal`): o seletor do
    painel não precisa dos `onClick`/`onKeyDown` defensivos que o cartão precisava — copiá-los é
    ruído.
11. **Fixtures de data sem `Z`** — o calendário ancora no dia local; com `Z` o teste vira função do
    fuso da máquina (comentário já existente no topo dos fixtures).
12. **O trilho das abas não quebra linha.** Se 375px apertar, reduza `padding` horizontal da aba —
    `flex-wrap` no trilho desfigura o pill; é caso de verificação visual, não de CSS preventivo.
