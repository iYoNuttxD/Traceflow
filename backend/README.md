# TRACEFLOW Backend

Backend do TRACEFLOW desenvolvido com Node.js, Express, Prisma e MySQL.

## Estrutura

```txt
src/
|-- config/
|-- database/
|-- modules/
|-- routes/
|-- app.js
`-- server.js
```

## Arquitetura

```txt
Routes -> Controller -> Service -> Repository -> Database
```

## Modulo de projetos

O RF01 disponibiliza os endpoints:

```txt
POST /api/projects
GET  /api/projects
GET  /api/projects/:id
PUT  /api/projects/:id
```

O cadastro recebe nome, descricao, equipe responsavel e URL do repositorio
GitHub. O owner e o nome do repositorio sao derivados automaticamente da URL.
O campo `createdAt` permite contabilizar novos projetos por periodo.

Para preparar o banco:

```bash
npm install
npx prisma generate
npx prisma migrate dev
```
