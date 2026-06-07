# TRACEFLOW

TRACEFLOW é uma plataforma de apoio à rastreabilidade e ao acompanhamento da evolução de projetos de software.

O MVP tem como foco integrar requisitos, tarefas e artefatos técnicos importados do GitHub.

## Cadeia principal do MVP

```txt
Requisito -> Tarefa -> Artefato GitHub
```

## Artefatos GitHub considerados

- Commit
- Pull Request
- Issue

## Stack

- React
- Vite
- Node.js
- Express
- MySQL
- Prisma
- Octokit

## Arquitetura backend

```txt
Routes -> Controller -> Service -> Repository -> Database
```

## Fluxo principal do MVP

1. Cadastrar projeto.
2. Vincular repositório GitHub.
3. Sincronizar commits, pull requests e issues.
4. Cadastrar requisitos.
5. Cadastrar tarefas.
6. Relacionar requisitos a tarefas.
7. Relacionar tarefas a artefatos GitHub.
8. Consultar rastreabilidade.

## Status do projeto

O RF01 está implementado com cadastro, listagem, consulta e edição de projetos
no backend e no frontend.
