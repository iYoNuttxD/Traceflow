---
category: Layout
---

The application shell: renders the global `Navbar` above the page content.
Every routed page is wrapped in it.

```jsx
<Layout>
  <main className="page-container">{page}</main>
</Layout>
```

Layout adds no container or padding of its own — give the page its own
`page-container` wrapper. It renders `Navbar`, which uses react-router links,
so it must sit inside a router.
