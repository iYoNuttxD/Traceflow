# RF06 Frontend - Informações do Repositório

## Objetivo

Implementar a interface do RF06 para exibir, no contexto de um projeto, os artefatos GitHub importados pelo backend:

- commits
- pull requests
- issues

## Rota frontend

```txt
/projects/:projectId/repository
```

A tela é acessível a partir da página de detalhes do projeto pelo botão:

```txt
Informações do Repositório
```

## Endpoint consumido

```http
GET /api/projects/:projectId/artifacts
```

## Filtros disponíveis

```txt
type=commit | pull_request | issue
startDate=YYYY-MM-DD
endDate=YYYY-MM-DD
```

O frontend não envia query params vazios.

## Campos exibidos

A tela exibe:

- cards de resumo com total, commits, pull requests, issues e completude;
- tabela unificada com tipo, título, autor, data, estado/número e link GitHub;
- estados de carregamento, erro e vazio.

## Validações executadas

```txt
npm run build
git diff --check
```

## Limitações conhecidas

Esta etapa não implementa dashboard, gráficos, relatórios, edição de artefatos ou vínculo entre tarefas e artefatos. O frontend apenas consome e exibe os dados normalizados pelo backend do RF06.
