---
applyTo: "backend/prisma/**/*,backend/scripts/test-database.js,backend/scripts/validate-empty-migrations.js,backend/scripts/**/*migration*.js,docs/database/**/*.md,docs/runbooks/DATABASE_MIGRATIONS.md,docs/runbooks/BACKUP_RESTORE.md"
---

# Banco e migrations

- MySQL/Prisma são a persistência oficial; toda alteração de schema usa migration incremental
  versionada.
- Nunca edite migration aplicada, use `db push` como evolução compartilhada ou proponha
  `prisma migrate reset` para resolver evolução.
- Preserve dados e relações. Mudança destrutiva exige inventário de consumers/dados, reconciliação,
  backup/restore verificado, guard antes do drop, janela e roll-forward.
- Verifique FK, índices, unicidade, cardinalidade, cascatas e comportamento sob concorrência.
- Migrations devem aplicar do zero e em upgrade representativo. `prisma validate`/`generate` não
  substituem deploy/status.
- `TEST_DATABASE_URL` deve apontar para schema isolado identificado como teste e diferente de
  `DATABASE_URL`; nunca use banco real para teste destrutivo.
- Para banco, migration ou concorrência, reproduza quando possível a imagem/configuração MySQL
  vigente em `.github/workflows/ci.yml`; não alegue paridade de CI com versão/configuração diferente.
- Backfill por nome/e-mail/texto não prova identidade. Relatórios usam contagens/checksums, sem PII.
- Legado só é removido com zero consumer e zero dado exclusivo comprovados; ausência de referência
  textual isolada não basta.
