-- S2-02 correções (S202-A03, ADR-016 D7): instante em que o tipo foi religado.
-- Vencimento com corte anterior a enabledAt não é notificado (sem efeito retroativo no RF59).

-- AlterTable
ALTER TABLE `NotificationPreference` ADD COLUMN `enabledAt` DATETIME(3) NULL;
