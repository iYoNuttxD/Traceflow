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

## Módulo de projetos

O RF01 implementa cadastro, listagem, consulta e edição de projetos nas rotas
`/projects` e `/projects/:id`.

O formulário carrega os repositórios por `GET /api/github/repositories`.
O usuário seleciona um repositório e o frontend envia owner, nome e URL ao
backend, sem digitação manual desses campos.
