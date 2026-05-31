# Arquitetura do TRACEFLOW

O TRACEFLOW sera desenvolvido como uma aplicacao web dividida em frontend e backend.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Banco de dados: MySQL
- ORM: Prisma
- Integracao externa: GitHub API via Octokit

## Arquitetura backend

```txt
Routes -> Controller -> Service -> Repository -> Database
```

## Responsabilidades

### Routes

Definem os endpoints da API.

### Controllers

Recebem as requisicoes HTTP, extraem dados da requisicao e chamam os services.

### Services

Concentrarao as regras de negocio.

### Repositories

Concentrarao o acesso ao banco de dados via Prisma.

### Database

Representa a camada de persistencia em MySQL.

## Decisao sobre artefatos GitHub

No diagrama conceitual, Commit, PullRequest e Issue aparecem como classes separadas. No MVP, esses artefatos serao generalizados na entidade `GithubArtifact`, com o campo `type` indicando:

- `COMMIT`
- `PULL_REQUEST`
- `ISSUE`

Essa decisao reduz a complexidade inicial e facilita a criacao dos vinculos de rastreabilidade.

## Rastreabilidade

A entidade `TraceLink` sera responsavel por registrar vinculos entre artefatos. No MVP, os principais vinculos serao:

```txt
Requirement -> Task
Task -> GithubArtifact
```

## Evolucao futura

A arquitetura deve permitir adicionar usuarios, sprints, casos de teste, defeitos, alertas, notificacoes, relatorios, indicadores e comentarios.

> TODO: Revisar este documento sempre que uma decisao arquitetural relevante for tomada.
