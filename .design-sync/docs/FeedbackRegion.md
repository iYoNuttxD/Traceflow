---
category: Feedback
---

Inline banner for the result of an action — a submit that failed, a save that
succeeded. Renders an always-present live region, so screen readers announce
messages that appear after the initial render.

```jsx
<FeedbackRegion error={submitError} success={saved && 'Projeto salvo.'} />
```

`error` wins when both are set. With neither, it renders an empty live region
rather than nothing — keep it mounted for the whole form instead of
conditionally rendering it, or the announcement is lost.
