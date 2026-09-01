---
category: Forms
---

Labelled text input with built-in error and accessibility wiring. This is the
only input primitive in the kit — every form field in Traceflow uses it.

**Important: `FormInput` carries no styling of its own.** All of its appearance
comes from rules scoped under `.schedule-form` in `styles.css`
(`.schedule-form .form-field`, `.schedule-form .form-field label`,
`.schedule-form .form-field input`, …). Rendered outside that ancestor the
field falls back to browser defaults — inline label, unstyled input box. Always
put it inside a `<form className="schedule-form">`:

```jsx
<form className="schedule-form" onSubmit={onSubmit} noValidate>
  <FormInput
    label="Nome"
    name="sprint-name"
    required
    value={formData.name}
    onChange={(event) => onChange('name', event.target.value)}
    error={errors.name}
  />
  <FormInput
    label="Início"
    name="sprint-startDate"
    type="datetime-local"
    required
    value={formData.startDate}
    onChange={(event) => onChange('startDate', event.target.value)}
    error={errors.startDate}
  />
</form>
```

`.schedule-form` also styles bare `.form-field` blocks, so a `<select>` or
`<textarea>` written by hand inside the same form picks up the matching look —
that is how the existing forms render their non-input fields.

`id` defaults to `name`, and that id is what links the `<label>` and the error
message to the input — always pass `name` (or an explicit `id`). Setting
`error` flips `aria-invalid` on and renders the message with `role="alert"`.
Any prop the component does not consume is forwarded straight to the `<input>`,
so `placeholder`, `disabled`, `autoComplete`, `min`/`max` and friends all work.
