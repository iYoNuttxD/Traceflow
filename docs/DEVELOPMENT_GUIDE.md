# Guia de Desenvolvimento

Este documento define regras simples para manter o desenvolvimento do TRACEFLOW organizado.

## Backend

A estrutura deve seguir:

```txt
Routes -> Controller -> Service -> Repository -> Database
```

## Regras

1. Nao colocar regra de negocio nos controllers.
2. Controllers devem chamar services.
3. Services devem concentrar validacoes e regras de negocio.
4. Services devem chamar repositories.
5. Repositories devem acessar o banco com Prisma.
6. O acesso ao GitHub deve ficar isolado em `github.client.js`.
7. O frontend deve consumir o backend por `api.js`.
8. Os nomes de arquivos devem estar em ingles.
9. A interface pode usar textos em portugues.
10. Cada modulo deve ser pequeno e facil de defender.

## Organizacao dos modulos

### Projects

Responsavel por projetos.

### Requirements

Responsavel por requisitos.

### Tasks

Responsavel por tarefas e Kanban.

### GitHub

Responsavel por importacao de commits, pull requests e issues.

### Traceability

Responsavel por vinculos e consultas de rastreabilidade.

## Padrao de desenvolvimento futuro

1. Criar ou ajustar rota.
2. Criar metodo no controller.
3. Criar regra no service.
4. Criar consulta no repository.
5. Testar manualmente pelo frontend ou API client.
6. Atualizar README ou documentacao se necessario.

> TODO: Complementar este guia com os comandos de ambiente e convencoes acordadas pela equipe.
