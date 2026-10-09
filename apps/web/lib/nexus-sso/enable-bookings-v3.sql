-- Liga a lista de reservas nova (flag bookings-v3) para as contas que entraram pelo login unico do
-- Nexus antes do provisionamento passar a ligar sozinho. A flag e por usuario (tabela UserFeatures);
-- a linha global em "Feature" ja existe pela migration 20251114173403. Idempotente: quem ja tem
-- linha, ligada ou desligada de proposito, nao e tocado. Rodar por conta propria, nunca por deploy.
INSERT INTO "UserFeatures" ("userId", "featureId", enabled, "assignedBy", "updatedAt")
SELECT a."userId", 'bookings-v3', true, 'nexus', now()
FROM "Account" a
WHERE a.provider = 'nexus'
ON CONFLICT ("userId", "featureId") DO NOTHING;
