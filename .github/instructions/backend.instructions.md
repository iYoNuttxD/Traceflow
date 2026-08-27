---
applyTo: "backend/src/**/*.js,backend/test/**/*.js,backend/scripts/**/*.js,backend/*.js,backend/package.json"
---

# Backend

- Preserve `Route → Controller → Service → Repository → Prisma`; clients externos descem a partir do
  service e nunca persistem.
- Routes cuidam de caminho/middlewares/schema; controllers adaptam HTTP; services contêm casos de
  uso/invariantes/transações; repositories concentram Prisma.
- `req`/`res` não entram em service/repository. Prisma/Octokit não entram em route/controller.
- Valide body, params e query com schemas estritos. IDs do cliente nunca provam projeto, usuário,
  papel, ownership, instalação ou repositório.
- Resolva o projeto antes de autorizar recurso filho. Ausência de membership é `404`; papel
  insuficiente é `403`; ator vem da sessão.
- Preserve erros públicos estáveis e sanitizados, com `requestId`, sem stack, secret, PII ou payload
  externo bruto.
- Operações compostas e invariantes concorrentes usam transação/lock adequados e releem o estado
  efetivo dentro da transação.
- Job persistido usa ID correlacionável; polling acompanha esse ID quando execuções puderem se
  confundir. Coalescing/stale/retry exigem contrato e teste determinístico; `FAILED` é estado do job,
  não erro HTTP da consulta de status.
- Integração externa deve paginar, limitar tempo/retry, normalizar erros e falhar fechada.
- Scripts operacionais não podem ser importados pelo runtime; modo destrutivo exige confirmação e
  target explicitamente seguro.
- Rode `npm run architecture:check`, `npm run security:secrets`, ESLint, Prettier e testes
  proporcionais ao módulo.
