-- Atualizado: 2026-11-21 05:48 BRT.
-- Serializa a troca de bindings com novas reservas e materializa os recursos
-- exigidos por reservas futuras antes de confirmar a versao do snapshot.

CREATE OR REPLACE FUNCTION nexus_lock_booking_resource_config()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."eventTypeId" IS NOT NULL
     AND NEW."status" IN ('accepted', 'pending', 'awaiting_host') THEN
    PERFORM 1 FROM "EventType" WHERE "id" = NEW."eventTypeId" FOR SHARE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER nexus_booking_resource_config_lock_trigger
BEFORE INSERT OR UPDATE OF "eventTypeId", "startTime", "endTime", "status", "metadata"
ON "Booking"
FOR EACH ROW
EXECUTE FUNCTION nexus_lock_booking_resource_config();

CREATE OR REPLACE FUNCTION nexus_reconcile_future_booking_resource_allocations(event_type_ids INTEGER[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  booking_record RECORD;
  selected_location UUID;
  location_text TEXT;
  location_ref TEXT;
  matched_location_count INTEGER;
  active_location_count INTEGER;
  allocated_location_count INTEGER;
BEGIN
  IF event_type_ids IS NULL OR cardinality(event_type_ids) = 0 THEN
    RETURN;
  END IF;

  FOR booking_record IN
    SELECT booking."id", booking."eventTypeId", booking."metadata"
    FROM "Booking" booking
    WHERE booking."eventTypeId" = ANY(event_type_ids)
      AND booking."status" IN ('accepted', 'pending', 'awaiting_host')
      AND booking."endTime" > CURRENT_TIMESTAMP
    ORDER BY booking."id"
    FOR UPDATE OF booking
  LOOP
    selected_location := NULL;
    location_text := NULLIF(booking_record."metadata" ->> 'nexusLocationId', '');
    location_ref := NULLIF(booking_record."metadata" ->> 'nexusLocationRef', '');

    SELECT count(DISTINCT pool."externalLocationId") INTO active_location_count
    FROM "NexusEventTypeResourceBinding" binding
    JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
    WHERE binding."eventTypeId" = booking_record."eventTypeId"
      AND binding."active" = true
      AND pool."active" = true;

    IF active_location_count = 0 THEN
      CONTINUE;
    END IF;

    IF location_ref IS NOT NULL THEN
      IF location_ref !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'NEXUS_RESOURCE_EXISTING_BOOKING_LOCATION_REQUIRED',
          CONSTRAINT = 'NexusBooking_resource_location';
      END IF;
      SELECT count(DISTINCT pool."externalLocationId"), min(pool."externalLocationId"::TEXT)::UUID
        INTO matched_location_count, selected_location
      FROM "NexusEventTypeResourceBinding" binding
      JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
      WHERE binding."eventTypeId" = booking_record."eventTypeId"
        AND binding."active" = true
        AND pool."active" = true
        AND encode(sha256(convert_to('nexus-booking-location:v1:' || lower(binding."externalServiceId"::TEXT) || ':' || lower(pool."externalLocationId"::TEXT), 'UTF8')), 'hex') = location_ref;
      IF matched_location_count <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'NEXUS_RESOURCE_EXISTING_BOOKING_LOCATION_REQUIRED',
          CONSTRAINT = 'NexusBooking_resource_location';
      END IF;
    ELSIF location_text IS NOT NULL THEN
      IF location_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'NEXUS_RESOURCE_EXISTING_BOOKING_LOCATION_REQUIRED',
          CONSTRAINT = 'NexusBooking_resource_location';
      END IF;
      selected_location := location_text::UUID;
    ELSE
      SELECT count(DISTINCT pool."externalLocationId"), min(pool."externalLocationId"::TEXT)::UUID
        INTO allocated_location_count, selected_location
      FROM "NexusBookingResourceAllocation" allocation
      JOIN "NexusBookingResourcePool" pool ON pool."id" = allocation."resourcePoolId"
      WHERE allocation."bookingId" = booking_record."id"
        AND EXISTS (
          SELECT 1
          FROM "NexusEventTypeResourceBinding" binding
          JOIN "NexusBookingResourcePool" active_pool ON active_pool."id" = binding."resourcePoolId"
          WHERE binding."eventTypeId" = booking_record."eventTypeId"
            AND binding."active" = true
            AND active_pool."active" = true
            AND active_pool."externalLocationId" = pool."externalLocationId"
        );

      IF allocated_location_count = 0 AND active_location_count = 1 THEN
        SELECT min(pool."externalLocationId"::TEXT)::UUID INTO selected_location
        FROM "NexusEventTypeResourceBinding" binding
        JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
        WHERE binding."eventTypeId" = booking_record."eventTypeId"
          AND binding."active" = true
          AND pool."active" = true;
      ELSIF allocated_location_count <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'NEXUS_RESOURCE_EXISTING_BOOKING_LOCATION_REQUIRED',
          CONSTRAINT = 'NexusBooking_resource_location';
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "NexusEventTypeResourceBinding" binding
      JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
      WHERE binding."eventTypeId" = booking_record."eventTypeId"
        AND binding."active" = true
        AND pool."active" = true
        AND pool."externalLocationId" = selected_location
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'NEXUS_RESOURCE_EXISTING_BOOKING_LOCATION_REQUIRED',
        CONSTRAINT = 'NexusBooking_resource_location';
    END IF;

    PERFORM pool."id"
    FROM "NexusEventTypeResourceBinding" binding
    JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
    WHERE binding."eventTypeId" = booking_record."eventTypeId"
      AND binding."active" = true
      AND pool."active" = true
      AND pool."externalLocationId" = selected_location
    ORDER BY pool."id"
    FOR UPDATE OF pool;

    -- Allocations comprometidas nunca sao removidas pelo sync. Somente as novas
    -- necessidades do contrato ativo sao acrescentadas aos compromissos futuros.
    INSERT INTO "NexusBookingResourceAllocation" ("bookingId", "resourcePoolId", "units")
    SELECT booking_record."id", pool."id", binding."units"
    FROM "NexusEventTypeResourceBinding" binding
    JOIN "NexusBookingResourcePool" pool ON pool."id" = binding."resourcePoolId"
    WHERE binding."eventTypeId" = booking_record."eventTypeId"
      AND binding."active" = true
      AND pool."active" = true
      AND pool."externalLocationId" = selected_location
    ON CONFLICT ("bookingId", "resourcePoolId") DO NOTHING;

    -- Reusa a validacao de pico e os locks do caminho normal da reserva.
    UPDATE "Booking" SET "startTime" = "startTime" WHERE "id" = booking_record."id";
  END LOOP;
END;
$$;
