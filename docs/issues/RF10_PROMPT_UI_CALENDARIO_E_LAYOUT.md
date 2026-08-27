# Prompt de implementação — RF10 (cronograma): limites do calendário e pareamento lista + formulário

> **Como usar este documento.** Ele é o enunciado completo da **terceira iteração do design de
> sprints e marcos** na branch `joao-dev-v2`, motivada pela avaliação visual de 26/08/2026. São duas
> mudanças de UI, independentes entre si, cada uma em um commit próprio:
>
> 1. **Fase 1** — o calendário do cronograma deixa de navegar sem limite: a navegação fica presa ao
>    intervalo que o cronograma realmente ocupa.
> 2. **Fase 2** — as telas de Sprints e de Marcos deixam de exibir dois cards de alturas
>    descombinadas: as colunas passam a dividir a mesma altura no desktop, e "Editar" passa a levar o
>    usuário ao formulário.
>
> Nenhuma linha de backend muda. Nenhum contrato HTTP muda. Leia as seções 0 a 3 antes de abrir
> qualquer arquivo; as decisões da seção 2 já estão tomadas — o trabalho é executá-las, não
> rediscuti-las (os pontos abertos a veto estão marcados como tal). Encerre pela seção 8.

---

## 0. Regras de trabalho (invioláveis)

1. **Escopo fechado.** O que este documento não pede, não entra. Achado fora de escopo
   (bug, débito, ideia) vai para `docs/issues/TECHNICAL_BACKLOG.md`, não vira mudança aqui.
2. **Nada de backend.** As duas fases são exclusivamente de `frontend/`. Se alguma parte parecer
   exigir mudança de API, a leitura está errada — pare e releia a seção 2.
3. **Módulo puro continua puro.** `schedule-calendar.js` não importa React, não faz I/O e não chama
   `new Date()` por conta própria — toda função nova recebe o que precisa por parâmetro. É a regra
   que mantém o calendário testável sem congelar o relógio do processo.
4. **Teste consulta pelo papel acessível**, nunca por classe CSS ou ordem de DOM
   (`getByRole`, `getByLabelText`). Asserção de layout (altura de card, coluna) não vira teste
   unitário: vira verificação visual da seção 6.
5. **Testes que codificam o comportamento antigo são reescritos às claras.** Dois testes de
   `ScheduleScreen.test.jsx` afirmam hoje a navegação livre (seção 4.5). A falha deles **não é
   defeito**: é a especificação nova. Reescreva-os citando este documento no comentário, sem apagar
   o que eles ainda provam (a navegação dentro do intervalo continua testada).
6. **Idioma e tom.** Código, comentários e `describe`/`it` em pt-BR, no registro dos arquivos já
   existentes. Comentário explica o *porquê* da regra, não o mecanismo da linha seguinte.
7. **Ambiente é do João.** Qualquer comando de serviço (dev server, instalação) é proposto e aguarda
   aval. As suítes do frontend rodam sem banco — essas rode direto.
8. **Evidência, não afirmação.** Alegação de "verde" vem com a saída real do comando. Verificação
   visual vem com captura de tela nos cenários da seção 6.
9. **Os dois extremos de dados.** O produto é avaliado com dados mínimos **e** em escala. Toda
   verificação visual desta entrega cobre 0 itens, 1 item e 15+ itens — a régua usada nas iterações
   anteriores.

### 0.1 Fontes normativas e precedência

| Ordem | Fonte | Papel aqui |
|---|---|---|
| 1 | Este documento (decisões da seção 2) | especificação da entrega |
| 2 | ADRs do repo: **ADR-011 > ADR-010 > ADR-009** | regras de domínio que os limites do calendário respeitam (janela semiaberta, prazo de marco livre, cancelada fora do calendário) |
| 3 | `TRACEFLOW_CONTEXTO_ARQUITETURA.md` | transversais: acessibilidade, qualidade de teste |
| 4 | `docs/architecture/FRONTEND_STRUCTURE.md` | organização do módulo `features/schedule` |

O estilo do CSS é o do próprio `global.css`: folha global de classes semânticas, cores em hex
literal, **sem tokens, sem utilitários, sem CSS custom properties novas**. Modificador segue o
padrão já existente (`calendar-day--fora`, `agenda-entry--atrasada`).

---

## 1. Problema (evidência de 26/08/2026)

**P1 — calendário sem limite.** As capturas mostram o calendário em `janeiro de 2028` e
`fevereiro de 2027` com a mesma naturalidade de `agosto de 2026`. Com os dados atuais, o cronograma
ocupa de julho/2026 (início da primeira sprint) a março/2027 (fim da última); tudo fora disso é
grade vazia infinita, para os dois lados. `previousMonth`/`nextMonth`
([schedule-calendar.js:279-285](../../frontend/src/features/schedule/components/schedule-calendar.js))
decrementam e incrementam para sempre, e os botões ▲/▼ nunca desabilitam.

**P2 — cards descombinados nas telas de Sprints e de Marcos.** As duas telas usam
`.schedule-columns` (grid `1.15fr / 0.85fr` com `align-items: start`,
[global.css:2234](../../frontend/src/styles/global.css)). A lista tem teto próprio
(`max-height: clamp(20rem, 46vh, 34rem)`, [global.css:3399](../../frontend/src/styles/global.css));
o formulário não tem teto nenhum. Resultado: o card "Sprints do projeto" termina no meio da altura
do card "Cadastrar sprint", **com barra de rolagem sobrando ao lado de espaço vazio** — é isso que
lê como quebrado. Três defeitos correlatos no mesmo layout:

- **VIEWER** não recebe formulário (decisão correta), mas o grid continua de duas colunas: o card
  único ocupa ~57% da largura e o resto é coluna fantasma.
- **Abaixo de 960px** o grid empilha, e "Editar" preenche um formulário que está fora da tela, sem
  rolar até ele — o usuário clica e nada visível acontece.
- Os `title` de Editar dizem "no formulário **ao lado**"
  ([SprintList.jsx:106](../../frontend/src/features/schedule/components/SprintList.jsx),
  [MilestoneList.jsx:145](../../frontend/src/features/schedule/components/MilestoneList.jsx)) —
  falso no empilhado.

---

## 2. Decisões de design (tomadas; executar como está)

### D1 — Intervalo navegável = meses que contêm algo pintado

O calendário navega apenas entre o **mês do primeiro dia pintado** e o **mês do último dia
pintado**. "Pintado" é o que a própria grade desenha:

- as **faixas de sprint** — sprints não canceladas, com a janela de `sprintDayRange` (a mesma
  função que já resolve o fim à meia-noite: uma sprint que termina em `01/09 00:00` pinta até
  31/08 e **não** desbloqueia setembro);
- os **pontos de prazo de marco** — `toIsoDay(milestone.dueDate)`.

> **Nota de fidelidade ao pedido.** O pedido literal era "entre o início da primeira sprint e o fim
> da última". A extensão pelos prazos de marco existe por uma razão só: o ADR-011 D03 permite prazo
> de marco fora de qualquer janela de sprint, e um ponto pintado num mês inalcançável seria
> informação que a tela afirma ter e não deixa ver. **Se o João preferir o intervalo estritamente
> de sprints, basta remover os marcos da união em `calendarBounds`** — mas registre no commit que
> prazos fora do intervalo ficam invisíveis na grade (seguem visíveis em "Próximos eventos").

### D2 — A fonte dos limites é o mesmo agregado que a grade pinta

O calendário recebe `schedule` já recortado pelo filtro "Período exibido" da tela de Cronograma.
Os limites derivam **desse mesmo conjunto** — filtro aplicado, navegação re-limitada junto. É a
extensão natural do texto que já está na tela: "O recorte vale para as faixas e para os eventos do
calendário". Sprint cancelada não entra (o componente já a filtra antes de pintar; os limites usam
a mesma lista filtrada).

### D3 — Nada pintado → mês corrente, travado

Agregado sem sprint e sem marco (projeto novo, ou filtro que não pegou nada): o calendário fica no
mês de hoje com as duas setas desabilitadas. Não há cronograma para navegar.

### D4 — Hoje fora do intervalo → a vista inicial gruda no limite mais próximo

Projeto todo no passado ou todo no futuro: em vez de abrir num mês corrente vazio, o calendário
abre no limite mais próximo — o usuário vê o cronograma, não a ausência dele. O **dia selecionado**
continua sendo hoje: o painel "Agenda de …" segue verdadeiro ("Nenhum evento neste dia"), e o
primeiro clique em qualquer dia visível realinha tudo.

### D5 — Setas desabilitadas por `aria-disabled`, não por `disabled` nativo

Quem navega por teclado clicando ▲ repetidamente chega ao limite **com o foco na seta**; um
`disabled` nativo nesse instante derruba o foco para o `body` — exatamente o tipo de perda que o
menu de ações já evita ao devolver o foco no `Escape`. Por isso, aqui (e só aqui): botão
continua focável, `aria-disabled="true"`, **guarda no handler** (clique em seta desabilitada é
no-op — `userEvent` dispara `onClick` mesmo com `aria-disabled`), estilo apagado via CSS e `title`
explicando o limite. O `disabled` nativo com `title` continua sendo o padrão do resto do produto
("Iniciar sprint"); esta exceção é pontual e justificada pelo foco.

### D6 — Layout: lado a lado com alturas pareadas no desktop; "Editar" foca o formulário

Entre (a) igualar as alturas mantendo lado a lado e (b) empilhar lista sobre formulário levando o
usuário à edição por rolagem, **a decisão é (a) no desktop — e o gesto de (b) onde o empilhamento
já existe (≤960px)**. Razões:

1. Lista + formulário é mestre-detalhe: durante a edição, o item editado e o formulário ficam
   visíveis juntos. Empilhar no desktop esconde um dos dois em qualquer momento e transforma cada
   edição em rolagem de ida e volta.
2. O formulário tem largura ótima de coluna (~40%); em largura total, os campos esticam ou exigem
   um `max-width` que devolve o espaço vazio por outro caminho.
3. O problema visto na captura não é o lado a lado — é o **teto da lista (46vh) descolado da
   altura do vizinho**. Pareando as alturas, a barra de rolagem da lista só aparece quando o
   conteúdo excede a altura do card irmão — some o "rolagem ao lado de espaço vazio".

Complementos da mesma decisão:

- **"Editar" (sprint e marco) move o foco para o primeiro campo do formulário preenchido.** No
  desktop pareado nada rola (o campo já está visível) e o teclado ganha o atalho; no empilhado o
  `focus()` nativo rola até o campo — sem `scrollIntoView({behavior:'smooth'})` manual, que
  ignoraria `prefers-reduced-motion`.
- **"Cancelar edição" devolve o foco ao primeiro campo** — o botão de cancelar desaparece ao ser
  clicado, e sem isso o foco cai no `body`.
- **VIEWER → coluna única** (`.schedule-columns--unica`): sem formulário, sem coluna fantasma.
- Os `title` de Editar trocam "no formulário ao lado" por "no formulário de edição" — verdadeiro
  nas duas larguras.

### D7 — O teto da lista passa a ser o card irmão (desktop); o clamp continua no empilhado

No pareado, a lista recebe `flex: 1 1 0` com piso `min-height: 12rem` e `max-height: none`: ela
preenche exatamente o espaço que o card irmão define e rola por dentro. `flex-basis: 0` é o que
impede a lista longa de inflar a linha do grid (com `auto`, 17 marcos ditariam a altura das duas
colunas); o piso de `12rem` é o que impede os painéis de tarefas/evolução — que montam **dentro**
do card da lista — de esmagá-la a zero. Abaixo de 960px nada disso vale: o
`max-height: clamp(20rem, 46vh, 34rem)` atual continua, porque no empilhado não há vizinho para
servir de teto.

### Fora desta entrega (registrado, não implementado)

- A tela de **Cronograma** (`ScheduleScreen`) mantém `.schedule-columns` como está — o pareamento é
  só das telas com formulário.
- Altura dos painéis internos (`SprintTasksPanel` fica alto com muitas tarefas do projeto): se
  incomodar na verificação visual, vai para o backlog, não para esta entrega.

---

## 3. Superfície de mudança

| Arquivo | Fase | O quê |
|---|---|---|
| `frontend/src/features/schedule/components/schedule-calendar.js` | 1 | novas funções puras `calendarBounds` e `clampMonth` |
| `frontend/src/features/schedule/components/ScheduleCalendar.jsx` | 1 | mês derivado com clamp, setas com limite, `escolherDia` com clamp |
| `frontend/src/styles/global.css` | 1 e 2 | estilo de seta desabilitada; variantes `--pareadas`/`--unica` |
| `frontend/src/features/schedule/pages/SprintsScreen.jsx` | 2 | classe da variante, ref no card do formulário, foco na edição, `title` |
| `frontend/src/features/schedule/pages/MilestonesScreen.jsx` | 2 | idem |
| `frontend/src/features/schedule/components/SprintList.jsx` | 2 | texto do `title` de Editar |
| `frontend/src/features/schedule/components/MilestoneList.jsx` | 2 | texto do `title` de Editar |
| `frontend/test/features/ScheduleScreen.test.jsx` | 1 | 2 testes reescritos + casos novos de limite |
| `frontend/test/features/SprintsScreen.test.jsx` | 2 | foco na edição e no cancelamento |
| `frontend/test/features/MilestonesScreen.test.jsx` | 2 | idem |

Nada além disso. `SprintForm.jsx`, `MilestoneForm.jsx`, `useScheduleData.js` e qualquer coisa de
`backend/` ficam intactos.

---

## 4. Fase 1 — Limites do calendário (commit próprio)

### 4.1 Funções puras (`schedule-calendar.js`)

Junto de `previousMonth`/`nextMonth`, no mesmo registro de comentário do arquivo:

```js
// Meses navegáveis do calendário: do mês do primeiro dia pintado ao mês do
// último. Pintado é o que a grade desenha — faixa de sprint (janela de
// sprintDayRange, a mesma que resolve o fim à meia-noite) e prazo de marco.
// Devolve null quando não há nada pintado: quem chama decide o mês de descanso.
export function calendarBounds({ sprints = [], milestones = [] }) { … }

// Prende um {ano, mes} ao intervalo. Sem limites (null), devolve como veio.
export function clampMonth(limites, { ano, mes }) { … }
```

Contratos exatos:

- `calendarBounds` percorre `sprintDayRange(sprint).inicio/.fim` de cada sprint recebida e
  `toIsoDay(milestone.dueDate)` de cada marco; ignora valores nulos; devolve
  `{ min: {ano, mes}, max: {ano, mes} }` com `mes` **0-based** (o mesmo vocabulário do estado do
  componente e de `previousMonth`/`nextMonth`). Comparação de dias é lexicográfica sobre o ISO —
  já é a norma do módulo.
- `calendarBounds` **não filtra status**: ela opera sobre o que recebe. Quem exclui `CANCELADA` é o
  chamador, que já faz isso para pintar — uma regra, um dono.
- `clampMonth` compara por índice absoluto (`ano * 12 + mes`) e devolve objeto novo quando prende
  (`{ ...limites.min }`), nunca o argumento mutado.

### 4.2 Componente (`ScheduleCalendar.jsx`)

O estado `{ ano, mes }` e o inicializador **não mudam**. Muda o que se lê dele:

```js
const limites = useMemo(() => {
  const pintado = calendarBounds({ sprints, milestones });
  if (pintado) return pintado;
  // Nada pintado: o calendário descansa no mês de hoje, travado (D3). O mês sai
  // do hojeIso (string estável) — a prop `hoje` é um Date novo a cada render e
  // estouraria o memo.
  const [ano, mes] = hojeIso.split('-').map(Number);
  return { min: { ano, mes: mes - 1 }, max: { ano, mes: mes - 1 } };
}, [sprints, milestones, hojeIso]);

// A vista nunca sai do intervalo, venha o desvio de onde vier: estado antigo,
// hoje fora do cronograma (D4) ou filtro que acabou de encolher o agregado (D2).
const mesExibido = clampMonth(limites, { ano, mes });
const noInicio =
  mesExibido.ano === limites.min.ano && mesExibido.mes === limites.min.mes;
const noFim = mesExibido.ano === limites.max.ano && mesExibido.mes === limites.max.mes;
```

A partir daí, **toda leitura de `ano`/`mes` passa a ler `mesExibido`** — são cinco pontos:
o `useMemo` de `celulas` (parâmetros e array de dependências, com
`mesExibido.ano`/`mesExibido.mes`), o `monthLabel` do cabeçalho, o `aria-label` do grupo
`calendar-grid`, e os dois handlers de seta. `escolherDia` prende o destino:

```js
const escolherDia = (iso) => {
  const [novoAno, novoMes] = iso.split('-').map(Number);
  setSelecionado(iso);
  // Dia cinza na borda de um mês-limite: a seleção vale (o dia está visível na
  // grade), mas a vista não atravessa o limite atrás dele.
  setMesVisivel(clampMonth(limites, { ano: novoAno, mes: novoMes - 1 }));
};
```

Setas (D5) — guarda no handler + `aria-disabled` + `title` só quando no limite:

```jsx
<button
  type="button"
  className="calendar-nav-button"
  aria-label="Mês anterior"
  aria-disabled={noInicio}
  title={noInicio ? 'O cronograma exibido começa neste mês.' : undefined}
  onClick={() => {
    if (noInicio) return;
    setMesVisivel(previousMonth(mesExibido.ano, mesExibido.mes));
  }}
>
  ▲
</button>
```

Espelhado para ▼ com `noFim` e "O cronograma exibido termina neste mês.". O "exibido" carrega o
caso do filtro de período sem precisar de outra frase.

### 4.3 CSS (`global.css`, junto de `.calendar-nav-button`)

Mesma paleta de desabilitado que `.checkbox-field-disabled` já usa:

```css
.calendar-nav-button[aria-disabled='true'] {
  border-color: #eef1f6;
  background: #f8fafc;
  color: #98a2b3;
  cursor: not-allowed;
}

.calendar-nav-button[aria-disabled='true']:hover {
  border-color: #eef1f6;
  background: #f8fafc;
}
```

### 4.4 O que NÃO muda na Fase 1

- "Próximos eventos" e os cartões de "Agora" — não são recortados pela grade e continuam listando
  o que houver, dentro ou fora do intervalo navegável.
- A legenda, as faixas, a agenda do dia — intocadas.
- `buildMonthGrid` — intocada; os meses fora do intervalo simplesmente deixam de ser alcançáveis.

### 4.5 Testes (`ScheduleScreen.test.jsx`)

**Reescrever (codificam a navegação livre — regra 5):**

| Teste atual | Situação | Reescrita |
|---|---|---|
| `'navega entre meses'` (linha ~250) | usa agregado **vazio** e navega para setembro e julho — passa a ser impossível | fixture com sprint de agosto + marco com `dueDate: '2026-09-20T00:00:00'` → navega ago→set, prova `aria-disabled` nos dois extremos e que o clique no limite é no-op (cabeçalho não muda) |
| `'selecionar dia de outro mes navega para o mes dele'` (linha ~295) | agregado vazio; clica 2/set e espera a vista ir junto | dois casos: (a) com limite ago–set, clicar dia de setembro **navega** (comportamento preservado dentro do intervalo); (b) com limite só-agosto, clicar o dia cinza 2/set **seleciona sem mover a vista** — `'Agenda de quarta-feira, 2 de setembro'` presente e cabeçalho ainda `'agosto de 2026'` |

**Acrescentar:**

1. *Agregado vazio trava no mês corrente* — estender `'projeto vazio mostra a grade e nenhum
   evento futuro'` (linha ~335) ou criar caso irmão: as duas setas com `aria-disabled="true"`.
2. *Cancelada não estende o intervalo* — sprint de agosto + sprint `CANCELADA` em dezembro:
   ▼ desabilitada em agosto. Par do teste existente `'sprint cancelada sai da faixa…'`.
3. *Fim à meia-noite não desbloqueia o mês seguinte* — sprint `endDate: '2026-09-01T00:00:00'`:
   ▼ desabilitada em agosto (a faixa termina 31/08).
4. *Marco fora do intervalo de sprints estende o limite* — o caso que justifica D1.
5. *Hoje fora do intervalo abre no limite mais próximo* — `hoje: new Date(2027, 0, 15, 12)` com
   sprint de agosto/2026: cabeçalho inicial `'agosto de 2026'`; painel do dia continua
   `'Agenda de sexta-feira, 15 de janeiro'`.
6. *Funções puras* — casos diretos de `calendarBounds` (vazio → `null`; união sprint+marco; ordem
   indiferente) e `clampMonth` (dentro, abaixo, acima, `null`), no mesmo estilo dos `describe` de
   função pura já existentes no arquivo.

Armadilhas de asserção: `aria-disabled` se afirma com
`toHaveAttribute('aria-disabled', 'true')` — `toBeDisabled()` do jest-dom só enxerga `disabled`
nativo e falharia sempre. Fixtures de data continuam **sem `Z`**, pelo motivo já comentado no
arquivo (o calendário ancora no dia local).

**Commit sugerido:**
`feat(schedule): limita a navegação do calendário ao intervalo do cronograma`

---

## 5. Fase 2 — Pareamento lista + formulário (commit próprio)

### 5.1 CSS (`global.css`)

Variantes de `.schedule-columns`, declaradas junto dela (linha ~2234). O pareamento vale só onde há
vizinho — por isso vive num media query de desktop, complementar ao `max-width: 960px` existente:

```css
/* Pareadas: as telas de gestão (lista + formulário) dividem a mesma altura no
   desktop. O teto da lista passa a ser o card irmão — flex-basis 0 impede a
   lista longa de inflar a linha, e o piso de 12rem impede os painéis internos
   de esmagá-la. Abaixo de 960px o grid empilha e o clamp original da lista
   volta a valer: no empilhado não há vizinho para servir de teto. */
@media (min-width: 961px) {
  .schedule-columns--pareadas {
    align-items: stretch;
  }

  .schedule-columns--pareadas > .card {
    display: flex;
    flex-direction: column;
  }

  .schedule-columns--pareadas .sprint-list,
  .schedule-columns--pareadas .milestone-list {
    flex: 1 1 0;
    min-height: 12rem;
    max-height: none;
  }
}

/* Única: VIEWER não recebe formulário; o card de leitura ocupa a largura toda
   em vez de deixar uma coluna fantasma. */
.schedule-columns--unica {
  grid-template-columns: minmax(0, 1fr);
}
```

Não tocar no bloco `.sprint-list, .milestone-list` das linhas ~3399 — ele continua sendo o
comportamento base (e o do empilhado).

### 5.2 Telas (`SprintsScreen.jsx` e `MilestonesScreen.jsx`)

**Wrapper.** A div `schedule-columns` das duas telas ganha a variante pela mesma condição que já
decide o formulário:

```jsx
<div
  className={`schedule-columns ${
    somenteLeitura ? 'schedule-columns--unica' : 'schedule-columns--pareadas'
  }`}
>
```

**Foco na edição.** Em cada tela: `useRef` no `<section className="card">` do formulário e um
efeito que move o foco quando a edição começa ou troca de alvo:

```jsx
const formCardRef = useRef(null);

// Editar promete "carrega no formulário de edição" — o foco completa a promessa.
// No pareado o campo já está visível e nada rola; no empilhado o focus() nativo
// rola até ele, respeitando prefers-reduced-motion (scrollIntoView animado não
// respeitaria). Disparar por editingSprintId cobre também trocar a edição de
// uma sprint para outra.
useEffect(() => {
  if (!editingSprintId) return;
  formCardRef.current?.querySelector('input, select, textarea')?.focus();
}, [editingSprintId]);
```

Em `MilestonesScreen`, o mesmo com `editingMilestoneId`. O primeiro campo é o de nome/título
(`FormInput` de `sprint-name` / `milestone-title`) — o `querySelector` na ordem do DOM já o
encontra sem mudar a API do `FormInput`.

**Cancelar edição devolve o foco.** No `onCancel` passado ao formulário (nas duas telas), depois de
limpar o estado:

```jsx
// O botão "Cancelar edição" desaparece ao ser clicado; sem realocar o foco,
// ele cai no body e o teclado perde o lugar.
formCardRef.current?.querySelector('input, select, textarea')?.focus();
```

**Textos.** `SprintList.jsx` (item Editar do menu, linha ~106): "Carrega nome, objetivo, marco e
datas no formulário **de edição**." — `MilestoneList.jsx` (linha ~145): "Carrega título, descrição
e prazo no formulário **de edição**."

### 5.3 O que NÃO muda na Fase 2

- `ScheduleScreen` continua com `.schedule-columns` pura (a tela do calendário não é pareada).
- A posição dos painéis de tarefas/evolução (dentro do card da lista) e o comportamento do
  formulário (validação, submit, VIEWER sem formulário) ficam como estão.
- Nenhum componente novo, nenhuma classe utilitária, nenhum estilo inline novo.

### 5.4 Testes (`SprintsScreen.test.jsx` e `MilestonesScreen.test.jsx`)

Nas suítes existentes de edição (as que já abrem o menu e clicam "Editar a sprint …" / o
link-ação "Editar o marco …"), acrescentar as asserções de foco — por papel, nunca por classe:

1. *Editar leva o foco ao formulário preenchido* — após o clique em Editar, o campo "Nome" (ou
   "Título") `toHaveFocus()` e `toHaveValue(...)` com o dado da sprint/marco.
2. *Trocar a edição refoca* — editar A, depois editar B: foco de volta ao campo, valor de B.
3. *Cancelar edição mantém o foco no formulário* — após "Cancelar edição", campo vazio e
   `toHaveFocus()`.

A variante de classe (`--pareadas`/`--unica`) e as alturas **não** viram asserção de teste (regra
4): são a seção 6.

**Commit sugerido:**
`feat(schedule): pareia lista e formulário no desktop e leva o foco à edição`

---

## 6. Verificação visual (obrigatória, com captura)

Dev server proposto ao João (regra 7). Matriz mínima — cada célula com captura:

| Cenário | Sprints (desktop ≥ 961px) | Marcos (desktop) | 375px (mobile) |
|---|---|---|---|
| 0 itens (projeto novo) | cards pareados; `EmptyState` sem barra de rolagem | idem | empilhado íntegro |
| 1 item | cards pareados; **sem** barra de rolagem na lista | idem | — |
| 15+ itens (seed em escala) | mesma altura; lista rola por dentro; barra só quando excede | idem (17 marcos do seed) | clamp de 46vh preservado |
| Painel de tarefas aberto | lista não esmaga abaixo de 12rem; formulário acompanha a altura | — | — |
| Editar item do fim da lista | foco no campo preenchido, nada salta | idem | **a tela rola até o formulário** |
| VIEWER | card único na largura toda, sem coluna fantasma | idem | — |
| Calendário: dados do seed | navegação presa a jul/2026–mar/2027; setas apagadas nos extremos, com `title` | — | grade íntegra |
| Calendário: filtro de período aplicado | limites encolhem junto com as faixas; "Limpar" devolve | — | — |

O critério da linha "1 item" é o do problema original: **card baixo ao lado de card alto, nunca
mais** — e o inverso também não (lista esticada não pode ganhar barra de rolagem com um item só).

---

## 7. Critérios de aceite

1. O calendário não exibe mês fora do intervalo pintado por nenhum caminho — seta, clique em dia
   cinza ou estado inicial. Exceção única: nada pintado → mês corrente travado (D3).
2. Setas no limite: `aria-disabled="true"`, clique no-op, `title` explicativo, foco preservado ao
   atingir o limite navegando por teclado.
3. Filtro de período re-limita a navegação na mesma aplicação do filtro; limpar devolve o
   intervalo completo (D2).
4. Hoje fora do intervalo: vista inicial no limite mais próximo; painel do dia continua correto
   (D4).
5. Desktop: nas telas de Sprints e Marcos, os dois cards da linha têm a mesma altura em todos os
   volumes de dados; barra de rolagem na lista apenas quando o conteúdo excede o card irmão.
6. VIEWER: card único em largura total nas duas telas.
7. Editar (sprint e marco) foca o primeiro campo preenchido; em ≤960px isso rola a página até o
   formulário; cancelar edição não derruba o foco no `body`.
8. Os dois testes reescritos citados nominalmente na mensagem do commit da Fase 1; nenhuma
   asserção antiga ainda válida foi perdida.
9. Suítes, lint, format e build verdes nos comandos da seção 8, com saída colada; cobertura acima
   dos limiares atuais do frontend (`statements 50, branches 45, functions 40, lines 53`), sem
   baixá-los.
10. `git diff` de `backend/` vazio.

---

## 8. Comandos de verificação (evidência colada no encerramento)

```bash
cd frontend && npm run lint && npm run format:check && npm run build && npm test
```

```bash
cd frontend && npm run test:coverage
```

Rodar a suíte **duas vezes** — resultado idêntico (nenhum teste novo pode depender de relógio ou
ordem; `hoje` entra por prop, como os testes atuais já fazem).

---

## 9. Registro documental

- `docs/traceability/RF_TECHNICAL_MATRIX.md`, linha do RF10: a matriz foi realinhada em 25/08 e já
  cita as telas atuais. Esta entrega não cria componente nem rota — **conferir** que nada ali
  afirma navegação livre do calendário; só editar se afirmar.
- Achados fora de escopo encontrados no caminho (ex.: altura dos painéis internos, seção 2) →
  `docs/issues/TECHNICAL_BACKLOG.md`, um por linha, com arquivo e uma frase.
- Nenhum ADR novo: nada aqui muda regra de domínio.

## 10. Checklist de DoD

- [ ] Fase 1: `calendarBounds`/`clampMonth` puras, com testes diretos
- [ ] Fase 1: vista derivada com clamp; setas com guarda + `aria-disabled` + `title`; `escolherDia` preso ao intervalo
- [ ] Fase 1: 2 testes reescritos com citação a este documento + 6 casos novos
- [ ] Fase 2: variantes `--pareadas` (desktop) e `--unica` no CSS, base intocada
- [ ] Fase 2: wrapper condicional nas duas telas; foco na edição, na troca de alvo e no cancelamento
- [ ] Fase 2: `title` de Editar corrigido nas duas listas
- [ ] Matriz visual da seção 6 completa, capturas anexadas, extremos de dados incluídos
- [ ] Comandos da seção 8 verdes, saída colada, suíte rodada duas vezes
- [ ] `RF_TECHNICAL_MATRIX.md` conferida; backlog alimentado; `backend/` intocado
- [ ] Dois commits nos moldes sugeridos (`feat(schedule): …`)

---

## Anexo — Armadilhas conhecidas desta entrega

1. **`hoje` é `new Date()` por parâmetro-padrão** — identidade nova a cada render. Memo e efeitos
   derivam do **`hojeIso`** (string), nunca do objeto `hoje`.
2. **`mes` do estado é 0-based; `iso` é 1-based.** `calendarBounds` devolve 0-based; todo
   `split('-')` de ISO precisa do `- 1`. Errar isso desloca o limite em um mês e nenhum teste de
   mês central pega.
3. **`userEvent.click` dispara `onClick` em botão `aria-disabled`** — sem a guarda no handler, o
   teste de no-op falha e o usuário real navega além do limite.
4. **`toBeDisabled()` não enxerga `aria-disabled`** — usar `toHaveAttribute('aria-disabled', 'true')`.
5. **Fixtures de data sem `Z`** — o calendário ancora no dia local; com `Z` o teste vira função do
   fuso da máquina (comentário já existente no topo dos fixtures).
6. **`flex: 1 1 auto` em vez de `1 1 0`** na lista pareada faz a lista longa inflar a linha do
   grid — o defeito de altura volta, agora nos dois cards ao mesmo tempo.
7. **Esquecer o media query** e aplicar o pareado no empilhado: com `flex-basis: 0`, a lista
   colapsa para o piso de 12rem no mobile. O pareado só existe em `min-width: 961px`.
8. **`scrollIntoView({ behavior: 'smooth' })`** ignora `prefers-reduced-motion` — o rolar da
   edição é o do `focus()` nativo, sem animação manual.
9. **Os dois testes de navegação usam agregado vazio de propósito** (era o jeito de navegar sem
   faixa no caminho). Na reescrita, o agregado precisa ter conteúdo — senão o teste novo prova o
   travamento (D3), não a navegação.
