## How to build with the Traceflow kit

### Styling idiom: global class names, no tokens

Traceflow has **no design tokens and no utility classes**. There is not a single
CSS custom property in the stylesheet — `var(--*)` will not resolve. Styling is
one global stylesheet of plain semantic class names, and colours are hard-coded
hex. Use the class names below; do not invent new ones, and do not reach for
Tailwind-style utilities (`p-4`, `bg-surface`) — none exist.

| Purpose | Classes |
|---|---|
| Page frame | `page-container` (page body), `page-header` (its `<h1>`/`<p>` block) |
| Surfaces | `card` (what the `Card` component renders) |
| Navigation | `navbar`, `brand`, `nav-link` |
| Buttons | `button` (base — always required), then `button-primary`, `button-secondary`, `button-danger` |
| Banners | `message` + `message-error` / `message-success` |
| Forms | `schedule-form` (**required wrapper**), `form-field`, `field-error` |
| Dialog footer | `dialog-actions` (right-aligned button row) |
| Lists | `project-list`, `project-item`, `project-item-header`, `project-meta` |
| Status chips | `status-badge` + one of `status-ativo`, `status-inativo`, `status-arquivado`, `status-pendente`, `status-cancelado`, `status-a_fazer`, `status-em_andamento`, `status-concluido` |
| Async states | `async-state` (centred flex **row** — the state components use it) |

Palette, when you must write a colour literal: `#315bce` primary blue,
`#101828` headings, `#172033` body, `#667085` muted, `#475467` secondary,
`#e2e7f0` borders, `#fff` surfaces, `#f5f7fb` page background. Errors are
`#9f2d2d` on `#fff2f2`; success is `#17643b` on `#effaf4`.

### Wrapping and setup

There is no theme provider. Two wrappers matter:

- **A router.** `Navbar` and `Layout` render react-router `<Link>`s and throw
  outside a router. Wrap previews/screens in `MemoryRouter` (exported from this
  bundle for exactly that purpose — it is not a Traceflow component).
- **`ConfirmProvider`**, once near the root, if anything calls `useConfirm()`.
  There is no separate dialog component: `useConfirm()` returns a function that
  opens the modal and resolves `true`/`false`.

### The one trap: `FormInput` is unstyled on its own

`FormInput`'s entire appearance lives under `.schedule-form` in the stylesheet
(`.schedule-form .form-field`, `… label`, `… input`). Rendered anywhere else it
falls back to browser defaults — inline label, bare input box. **Always put form
fields inside `<form className="schedule-form">`.** That wrapper also styles
hand-written `.form-field` blocks, so `<select>` and `<textarea>` written by hand
inside it match the inputs.

### Copy

The product is Brazilian Portuguese. Write UI strings in pt-BR ("Cadastrar
projeto", "Nenhum marco cadastrado.", "Tentar novamente").

### Where the truth lives

Read the bundled `styles.css` and the `_ds_bundle.css` it imports for the real
rules before styling anything, and each component's `.prompt.md` for its API and
usage. Those files are authoritative; this summary is not.

### Idiomatic example

```jsx
<Layout>
  <main className="page-container">
    <header className="page-header">
      <h1>Cronograma</h1>
    </header>

    <FeedbackRegion error={error} success={success} />

    <Card title="Cadastrar sprint">
      <form className="schedule-form" onSubmit={onSubmit} noValidate>
        <FormInput
          label="Nome"
          name="sprint-name"
          required
          value={form.name}
          onChange={(e) => onChange('name', e.target.value)}
          error={errors.name}
        />
        <div className="dialog-actions">
          <button type="button" className="button button-secondary">Cancelar</button>
          <button type="submit" className="button button-primary">Salvar</button>
        </div>
      </form>
    </Card>

    <Card title="Sprints cadastradas">
      <RequestState loading={loading} error={error} empty={!sprints.length} onRetry={reload}>
        <div className="project-list">
          {sprints.map((s) => (
            <article className="project-item" key={s.id}>
              <div className="project-item-header">
                <div><h3>{s.name}</h3><p>{s.goal}</p></div>
                <span className="status-badge status-em_andamento">EM ANDAMENTO</span>
              </div>
            </article>
          ))}
        </div>
      </RequestState>
    </Card>
  </main>
</Layout>
```
