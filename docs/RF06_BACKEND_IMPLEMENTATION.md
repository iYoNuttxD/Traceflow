# RF06 Backend - Exibição de artefatos GitHub

## Objetivo

Implementar o backend do RF06 para exibir, em uma resposta consolidada, os artefatos GitHub já importados para um projeto TRACEFLOW:

- commits
- pull requests
- issues

Esta etapa não implementa frontend, dashboard, relatórios, webhooks, sincronização automática nem nova tabela Prisma.

## Endpoint

```http
GET /api/projects/:projectId/artifacts
```

## Filtros suportados

Todos os filtros são opcionais e podem ser usados de forma independente ou combinada.

```txt
type=commit | pull_request | issue
startDate=YYYY-MM-DD
endDate=YYYY-MM-DD
```

As datas são tratadas como datas puras em UTC. O `endDate` usa limite exclusivo do dia seguinte.

Exemplo:

```txt
startDate=2026-06-01
endDate=2026-06-07
```

Filtra:

```txt
>= 2026-06-01T00:00:00.000Z
<  2026-06-08T00:00:00.000Z
```

## Formato da resposta

```json
{
  "project": {
    "id": 1,
    "name": "Traceflow"
  },
  "filters": {
    "type": "commit",
    "startDate": "2026-06-01",
    "endDate": "2026-06-07"
  },
  "summary": {
    "total": 1,
    "commits": 1,
    "pullRequests": 0,
    "issues": 0,
    "completeArtifacts": 1,
    "metadataCompletenessPercentage": 100
  },
  "artifacts": [
    {
      "id": 10,
      "type": "commit",
      "externalId": "abc123",
      "title": "feat: sync repository commits",
      "author": "Daniel",
      "date": "2026-06-06T15:42:14.000Z",
      "projectId": 1,
      "projectName": "Traceflow",
      "githubUrl": "https://github.com/owner/repo/commit/abc123",
      "metadata": {
        "branch": "main",
        "state": null,
        "number": null
      }
    }
  ]
}
```

## Critério de completude

O indicador `metadataCompletenessPercentage` segue o critério do RF06:

```txt
(artefatos exibidos com campos obrigatórios preenchidos / total de artefatos exibidos) x 100
```

Nesta implementação backend, os campos obrigatórios para a exibição são:

```txt
type
author
date
projectId
projectName
```

Quando `total` for `0`, o percentual retorna `0`.

## Validações executadas

```txt
node --check src/modules/artifacts/artifact.repository.js
node --check src/modules/artifacts/artifact.service.js
node --check src/modules/artifacts/artifact.controller.js
node --check src/modules/artifacts/artifact.routes.js
node --check src/modules/projects/project.routes.js
npm exec prisma -- validate --schema prisma/schema.prisma
npm exec prisma -- generate --schema prisma/schema.prisma
npm exec prisma -- migrate status --schema prisma/schema.prisma
git diff --check
```

## Próximo passo

Implementar o frontend do RF06 para visualizar os artefatos e aplicar filtros de projeto, tipo e intervalo de datas.

## Ajustes finais de qualidade

- Consultas do RF06 usam `select` no Prisma para buscar apenas campos usados na resposta normalizada.
- Campos grandes não exibidos, como descrições de pull requests e issues, não são buscados na listagem consolidada.
