-- Atualizado: 2026-11-20 08:06 BRT.
-- O banco do motor e a autoridade final: availability de tela pode ficar obsoleta
-- entre leitura e insert, portanto a capacidade precisa ser serializada na transacao da Booking.

CREATE TABLE "NexusBookingResourcePool" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "workspaceKey" TEXT NOT NULL,
  "ownerUserId" INTEGER NOT NULL,
  "externalResourceId" UUID NOT NULL,
  "externalLocationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sourceVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NexusBookingResourcePool_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NexusBookingResourcePool_capacity_check" CHECK ("capacity" > 0),
  CONSTRAINT "NexusBookingResourcePool_sourceVersion_check" CHECK ("sourceVersion" > 0)
);

CREATE TABLE "NexusEventTypeResourceBinding" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "workspaceKey" TEXT NOT NULL,
  "ownerUserId" INTEGER NOT NULL,
  "externalServiceId" UUID NOT NULL,
  "eventTypeId" INTEGER NOT NULL,
  "resourcePoolId" UUID NOT NULL,
  "units" SMALLINT NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sourceVersion" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NexusEventTypeResourceBinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NexusEventTypeResourceBinding_units_check" CHECK ("units" = 1),
  CONSTRAINT "NexusEventTypeResourceBinding_sourceVersion_check" CHECK ("sourceVersion" > 0)
);

CREATE TABLE "NexusBookingResourceAllocation" (
  "bookingId" INTEGER NOT NULL,
  "resourcePoolId" UUID NOT NULL,
  "units" SMALLINT NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NexusBookingResourceAllocation_pkey" PRIMARY KEY ("bookingId", "resourcePoolId"),
  CONSTRAINT "NexusBookingResourceAllocation_units_check" CHECK ("units" = 1)
);

CREATE TABLE "NexusResourceCapacitySyncState" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "workspaceKey" TEXT NOT NULL,
  "ownerUserId" INTEGER NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NexusResourceCapacitySyncState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NexusResourceCapacitySyncState_sourceVersion_check" CHECK ("sourceVersion" > 0)
);

CREATE UNIQUE INDEX "NexusBookingResourcePool_scope_resource_location_key"
  ON "NexusBookingResourcePool"("tenantId", "workspaceKey", "externalResourceId", "externalLocationId");
CREATE INDEX "NexusBookingResourcePool_scope_active_idx"
  ON "NexusBookingResourcePool"("tenantId", "workspaceKey", "active");
CREATE UNIQUE INDEX "NexusEventTypeResourceBinding_eventType_pool_key"
  ON "NexusEventTypeResourceBinding"("eventTypeId", "resourcePoolId");
CREATE UNIQUE INDEX "NexusEventTypeResourceBinding_scope_service_pool_key"
  ON "NexusEventTypeResourceBinding"("tenantId", "workspaceKey", "externalServiceId", "resourcePoolId");
CREATE INDEX "NexusEventTypeResourceBinding_eventType_active_idx"
  ON "NexusEventTypeResourceBinding"("eventTypeId", "active");
CREATE INDEX "NexusEventTypeResourceBinding_pool_active_idx"
  ON "NexusEventTypeResourceBinding"("resourcePoolId", "active");
CREATE INDEX "NexusBookingResourceAllocation_pool_idx"
  ON "NexusBookingResourceAllocation"("resourcePoolId");
CREATE UNIQUE INDEX "NexusResourceCapacitySyncState_scope_key"
  ON "NexusResourceCapacitySyncState"("tenantId", "workspaceKey");

ALTER TABLE "NexusEventTypeResourceBinding"
  ADD CONSTRAINT "NexusEventTypeResourceBinding_eventTypeId_fkey"
  FOREIGN KEY ("eventTypeId") REFERENCES "EventType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NexusEventTypeResourceBinding"
  ADD CONSTRAINT "NexusEventTypeResourceBinding_resourcePoolId_fkey"
  FOREIGN KEY ("resourcePoolId") REFERENCES "NexusBookingResourcePool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NexusBookingResourceAllocation"
  ADD CONSTRAINT "NexusBookingResourceAllocation_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NexusBookingResourceAllocation"
  ADD CONSTRAINT "NexusBookingResourceAllocation_resourcePoolId_fkey"
  FOREIGN KEY ("resourcePoolId") REFERENCES "NexusBookingResourcePool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION nexus_apply_booking_resource_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_location UUID;
  location_text TEXT;
  location_count INTEGER;
  allocation_count INTEGER;
  pool_record RECORD;
  used_units INTEGER;
BEGIN
  IF NEW."eventTypeId" IS NULL OR NEW."status" NOT IN ('accepted', 'pending', 'awaiting_host') THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO allocation_count
  FROM "NexusBookingResourceAllocation"
  WHERE "bookingId" = NEW."id";

  -- Status e horario podem mudar sem trocar o compromisso de recurso. Reconstroi apenas
  -- quando o tipo/unidade mudou ou quando uma Booking legada ainda nao tem snapshot.
  IF TG_OP = 'UPDATE' AND allocation_count > 0
     AND OLD."eventTypeId" IS NOT DISTINCT FROM NEW."eventTypeId"
     AND (OLD."metadata" ->> 'nexusLocationId') IS NOT DISTINCT FROM (NEW."metadata" ->> 'nexusLocationId') THEN
    NULL;
  ELSE
    DELETE FROM "NexusBookingResourceAllocation" WHERE "bookingId" = NEW."id";

    SELECT count(DISTINCT pool."externalLocationId") INTO location_count
    FROM "NexusEventTypeResourceBinding" binding
    JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
    WHERE binding."eventTypeId" = NEW."eventTypeId"
      AND binding."active" = true
      AND pool."active" = true;

    IF location_count = 0 THEN
      RETURN NEW;
    END IF;

    location_text := NULLIF(NEW."metadata" ->> 'nexusLocationId', '');
    IF location_text IS NOT NULL THEN
      IF location_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'NEXUS_RESOURCE_LOCATION_INVALID',
          CONSTRAINT = 'NexusBooking_resource_location';
      END IF;
      selected_location := location_text::UUID;
    ELSIF location_count = 1 THEN
      SELECT pool."externalLocationId" INTO selected_location
      FROM "NexusEventTypeResourceBinding" binding
      JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
      WHERE binding."eventTypeId" = NEW."eventTypeId"
        AND binding."active" = true
        AND pool."active" = true
      LIMIT 1;
    ELSE
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'NEXUS_RESOURCE_LOCATION_REQUIRED',
        CONSTRAINT = 'NexusBooking_resource_location';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "NexusEventTypeResourceBinding" binding
      JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
      WHERE binding."eventTypeId" = NEW."eventTypeId"
        AND binding."active" = true
        AND pool."active" = true
        AND pool."externalLocationId" = selected_location
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'NEXUS_RESOURCE_LOCATION_NOT_BOUND',
        CONSTRAINT = 'NexusBooking_resource_location';
    END IF;

    -- A ordem fixa elimina deadlock quando dois servicos exigem o mesmo conjunto em ordem diferente.
    PERFORM pool."id"
    FROM "NexusEventTypeResourceBinding" binding
    JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
    WHERE binding."eventTypeId" = NEW."eventTypeId"
      AND binding."active" = true
      AND pool."active" = true
      AND pool."externalLocationId" = selected_location
    ORDER BY pool."id"
    FOR UPDATE OF pool;

    INSERT INTO "NexusBookingResourceAllocation" ("bookingId", "resourcePoolId", "units")
    SELECT NEW."id", pool."id", binding."units"
    FROM "NexusEventTypeResourceBinding" binding
    JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
    WHERE binding."eventTypeId" = NEW."eventTypeId"
      AND binding."active" = true
      AND pool."active" = true
      AND pool."externalLocationId" = selected_location;
  END IF;

  FOR pool_record IN
    SELECT pool."id", pool."capacity"
    FROM "NexusBookingResourceAllocation" own_allocation
    JOIN "NexusBookingResourcePool" pool ON pool."id" = own_allocation."resourcePoolId"
    WHERE own_allocation."bookingId" = NEW."id"
    ORDER BY pool."id"
    FOR UPDATE OF pool
  LOOP
    WITH resource_events AS (
      SELECT booking."startTime" AS event_at, allocation."units"::INTEGER AS delta
      FROM "NexusBookingResourceAllocation" allocation
      JOIN "Booking" booking ON booking."id" = allocation."bookingId"
      WHERE allocation."resourcePoolId" = pool_record."id"
        AND booking."status" IN ('accepted', 'pending', 'awaiting_host')
        AND booking."startTime" < NEW."endTime"
        AND booking."endTime" > NEW."startTime"
      UNION ALL
      SELECT booking."endTime" AS event_at, -allocation."units"::INTEGER AS delta
      FROM "NexusBookingResourceAllocation" allocation
      JOIN "Booking" booking ON booking."id" = allocation."bookingId"
      WHERE allocation."resourcePoolId" = pool_record."id"
        AND booking."status" IN ('accepted', 'pending', 'awaiting_host')
        AND booking."startTime" < NEW."endTime"
        AND booking."endTime" > NEW."startTime"
    ), grouped_events AS (
      SELECT event_at, sum(delta)::INTEGER AS delta FROM resource_events GROUP BY event_at
    ), running_usage AS (
      SELECT sum(delta) OVER (ORDER BY event_at ROWS UNBOUNDED PRECEDING)::INTEGER AS used
      FROM grouped_events
    )
    SELECT COALESCE(max(used), 0) INTO used_units FROM running_usage;

    IF used_units > pool_record."capacity" THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'NEXUS_RESOURCE_CAPACITY_EXCEEDED',
        CONSTRAINT = 'NexusBookingResourcePool_capacity';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER nexus_booking_resource_capacity_trigger
AFTER INSERT OR UPDATE OF "eventTypeId", "startTime", "endTime", "status", "metadata"
ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION nexus_apply_booking_resource_capacity();

CREATE OR REPLACE FUNCTION nexus_validate_resource_pool_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  used_units INTEGER;
BEGIN
  IF NEW."active" = true AND (OLD."active" = false OR NEW."capacity" < OLD."capacity") THEN
    WITH resource_events AS (
      SELECT booking."startTime" AS event_at, allocation."units"::INTEGER AS delta
      FROM "NexusBookingResourceAllocation" allocation
      JOIN "Booking" booking ON booking."id" = allocation."bookingId"
      WHERE allocation."resourcePoolId" = NEW."id"
        AND booking."status" IN ('accepted', 'pending', 'awaiting_host')
        AND booking."endTime" > CURRENT_TIMESTAMP
      UNION ALL
      SELECT booking."endTime" AS event_at, -allocation."units"::INTEGER AS delta
      FROM "NexusBookingResourceAllocation" allocation
      JOIN "Booking" booking ON booking."id" = allocation."bookingId"
      WHERE allocation."resourcePoolId" = NEW."id"
        AND booking."status" IN ('accepted', 'pending', 'awaiting_host')
        AND booking."endTime" > CURRENT_TIMESTAMP
    ), grouped_events AS (
      SELECT event_at, sum(delta)::INTEGER AS delta FROM resource_events GROUP BY event_at
    ), running_usage AS (
      SELECT sum(delta) OVER (ORDER BY event_at ROWS UNBOUNDED PRECEDING)::INTEGER AS used
      FROM grouped_events
    )
    SELECT COALESCE(max(used), 0) INTO used_units FROM running_usage;

    IF used_units > NEW."capacity" THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'NEXUS_RESOURCE_CAPACITY_BELOW_COMMITTED',
        CONSTRAINT = 'NexusBookingResourcePool_capacity';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER nexus_resource_pool_capacity_update_trigger
BEFORE UPDATE OF "capacity", "active"
ON "NexusBookingResourcePool"
FOR EACH ROW
EXECUTE FUNCTION nexus_validate_resource_pool_capacity();
