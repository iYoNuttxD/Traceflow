-- PR #26, terceira revisão (UX-R3-03, ADR-015 D5): o gatilho SCHEDULED separa a varredura do worker
-- do comando manual (SCRIPT) e da API (MANUAL). O valor novo entra no fim do enum.

-- AlterTable
ALTER TABLE `TraceabilityAlertReconciliation` MODIFY `lastTrigger` ENUM('GITHUB_SYNC', 'GITHUB_INTEGRATION', 'MANUAL', 'SCRIPT', 'SCHEDULED') NOT NULL;
