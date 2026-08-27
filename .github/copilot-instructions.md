# Instruções globais do GitHub Copilot

Leia e siga `AGENTS.md`, fonte operacional compartilhada do TRACEFLOW, e os arquivos
`.github/instructions/*.instructions.md` aplicáveis ao caminho alterado.

- Trabalhe a partir do diff e do estado real da head branch; preserve mudanças fora do escopo.
- Derive decisões da arquitetura, ADRs, contratos, matrizes e código vigentes.
- Não trate roadmap, delivery, refactoring ou histórico como requisito atual sem confirmação.
- Não canonize arquitetura nova neste adapter; encaminhe a decisão à fonte canônica primeiro.
- Exerça a autonomia técnica local definida em `AGENTS.md`; peça decisão quando o impacto for
  relevante e houver alternativas válidas.
- Mantenha mudanças pequenas, completas e rastreáveis. Declare impacto documental ou
  `Documentação: N/A`.
- Nunca inclua segredos ou PII em código, logs, exemplos, findings ou sugestões.
- Para Code Review, use `.github/skills/code-review/SKILL.md` e o standard canônico apontado por ele.
- Não publique review/comentário nem faça mudança remota sem solicitação explícita.
