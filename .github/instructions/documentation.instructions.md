---
applyTo: "**/*.md"
---

# Documentação

- Preserve a precedência de `AGENTS.md`: requisitos/TCC, estado executável, contratos, matrizes e
  políticas vigentes antes de contexto histórico.
- Não transforme roadmap, capacidade futura, decisão pendente, teste automatizado ou delivery em
  funcionalidade homologada.
- Separe implementado, parcial, não implementado, manual, externo, automatizado, simulado, `PASS`,
  `FAIL`, `BLOCKED` e `N/A`.
- RFs, endpoints, códigos HTTP, papéis, models, migrations, scripts e checks são conferidos no código
  vigente antes de documentar.
- Não renumere RFs, reescreva histórico para parecer atual nem altere TCC/roadmap fora de escopo.
- Decisão arquitetural relevante nasce em requisito/arquitetura/ADR/contrato; arquivos de agentes
  apenas refletem a decisão já tomada.
- Mudança que afete comportamento, contrato, arquitetura, banco, segurança, autorização, integração,
  operação ou requisito atualiza a fonte canônica correspondente na mesma PR.
- Sem impacto documental real, registre `Documentação: N/A`; não produza alteração cosmética de docs.
- Links relativos devem resolver no repositório. Evite duplicar regras extensas; aponte para a fonte
  canônica.
- Nunca inclua segredo, PII real, dump, token ou credencial em exemplo/evidência.
- Use linguagem verificável: informe comandos/evidências realmente executados e limitações.
