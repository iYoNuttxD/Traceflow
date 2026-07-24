# Estrutura frontend do TRACEFLOW

## Direção permitida

```text
app/routes → pages → features → shared
                         ↓
                    services/api
```

- `pages` compõem um fluxo de rota e seus estados de página.
- `features/<domain>` reúne comportamento, API e componentes específicos de um domínio.
- `shared` contém elementos reutilizáveis e independentes de domínio.
- `services` e o client HTTP central encapsulam infraestrutura, sem importar pages.

`shared` não importa `features` nem `pages`. Uma feature não importa internals de outra feature; quando houver integração, ela usa a API pública do `index.js` ou a page coordena as duas.

## Localização por responsabilidade

| Responsabilidade | Local |
|---|---|
| Roteamento e providers globais | `src/app/` ou, durante a transição, `src/routes/` |
| Página vinculada a uma rota | `src/pages/` |
| Componente específico de projeto/requisito/tarefa | `src/features/<domain>/components/` |
| Chamada HTTP específica de domínio | `src/features/<domain>/api/` |
| Componente reutilizável sem regra de domínio | `src/shared/components/` |
| Hook específico | `src/features/<domain>/hooks/` |
| Hook transversal | `src/shared/hooks/` |
| Formatador/utilitário transversal | `src/shared/utils/` |
| Client Axios e infraestrutura HTTP | `src/api/` ou futura `src/shared/services/` |
| Testes | `frontend/test/`, espelhando `components`, `pages` e futuras features |

Somente pastas com arquivos reais devem ser criadas.

## Feature Projects migrada

```text
src/features/projects/
├── api/projects.api.js
├── components/ProjectForm.jsx
└── index.js
```

`ProjectsPage.jsx` permanece como page e consome a API pública da feature. `ProjectForm.jsx` antigo é um reexport temporário para consumidores e testes existentes. `Card` foi movido para `shared/components`, também com reexport compatível.

## Imports e ciclos

- Pages importam somente o `index.js` público de uma feature quando possível.
- Internals de uma feature usam caminhos diretos dentro dela, nunca seu próprio índice.
- `shared` nunca sobe para feature/page.
- Imports cruzados entre features exigem composição na page ou uma abstração realmente compartilhada.
- Não são criados aliases na E2; caminhos relativos permanecem explícitos.

## Compatibilidade

Reexports temporários devem conter `TODO(E2.9)`, não podem conter regra nem duplicar implementação e serão removidos somente após todos os consumidores migrarem com testes verdes.
