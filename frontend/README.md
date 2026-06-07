# TRACEFLOW Frontend

Frontend do TRACEFLOW desenvolvido com React e Vite.

## Estrutura

```txt
src/
|-- api/
|-- assets/
|-- components/
|-- pages/
|-- routes/
|-- styles/
|-- App.jsx
`-- main.jsx
```

## Modulo de projetos

O RF01 implementa cadastro, listagem, consulta e edicao de projetos nas rotas
`/projects` e `/projects/:id`.

O formulario carrega os repositorios por `GET /api/github/repositories`.
O usuario seleciona um repositorio e o frontend envia owner, nome e URL para
o backend, sem digitacao manual desses campos.
