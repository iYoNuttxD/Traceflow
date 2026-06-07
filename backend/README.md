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

O cadastro recebe nome, descricao, equipe responsavel e os dados do repositorio
selecionado no GitHub. O frontend usa `GET /api/github/repositories` para
carregar os repositorios vinculados ao token configurado.
O campo `createdAt` permite contabilizar novos projetos por periodo.

Para preparar o banco:

```bash
npm install
npx prisma generate
npx prisma migrate dev
```
