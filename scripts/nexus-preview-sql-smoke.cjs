const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
// Fixed local container/database only. All fixture DDL and RPC replacement roll back.
const migration = readFileSync(resolve(__dirname, '../../../sql/2026-09-09-nexus-booking-exclusive-effect-claim.sql'), 'utf8').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
const sql = `BEGIN;
CREATE TABLE public.nexus_booking_reservations (id uuid PRIMARY KEY, status text, lease_token uuid, lease_expires_at timestamptz, updated_at timestamptz, provider_booking_id text);
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $roles$;
${migration}
INSERT INTO public.nexus_booking_reservations(id,status) VALUES ('00000000-0000-4000-8000-000000000001','reserved');
DO $test$ DECLARE result jsonb; BEGIN
  result := public.nexus_booking_start_effect_v1('00000000-0000-4000-8000-000000000001');
  IF result->>'status' <> 'side_effect_started' THEN RAISE EXCEPTION 'first claim failed'; END IF;
  BEGIN
    PERFORM public.nexus_booking_start_effect_v1('00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'duplicate claim unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    IF SQLERRM <> 'booking_effect_already_claimed' THEN RAISE; END IF;
  END;
END $test$;
ROLLBACK;
SELECT CASE WHEN to_regclass('public.nexus_booking_reservations') IS NULL THEN 'PASS: local SQL claim and rollback' ELSE 'FAIL: fixture remains' END;
`;
const output = execFileSync('docker', ['exec', '-i', 'nexus-agenda-preview-database-1', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'agenda_preview', '-d', 'agenda_preview'], { input: sql, encoding: 'utf8' });
if (!output.includes('PASS: local SQL claim and rollback')) throw new Error('SQL fixture rollback not verified');
console.log('PASS: PostgreSQL16 executes migration; repeated claim rejected; all fixture DDL rolled back. No remote database touched.');
