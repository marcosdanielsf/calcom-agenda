-- Criado: 2026-11-20 07:24 BRT. Schema mínimo para provar o trigger em PostgreSQL 17 real.
CREATE TYPE "BookingStatus" AS ENUM ('cancelled', 'accepted', 'rejected', 'pending', 'awaiting_host');
CREATE TABLE "EventType" ("id" INTEGER PRIMARY KEY, "userId" INTEGER, "metadata" JSONB);
CREATE TABLE "Booking" (
  "id" SERIAL PRIMARY KEY,
  "uid" TEXT NOT NULL UNIQUE,
  "eventTypeId" INTEGER REFERENCES "EventType"("id"),
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'accepted',
  "metadata" JSONB,
  "paid" BOOLEAN NOT NULL DEFAULT false
);
