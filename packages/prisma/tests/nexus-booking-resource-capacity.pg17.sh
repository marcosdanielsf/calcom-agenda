#!/usr/bin/env bash
# Atualizado: 2026-11-20 08:18 BRT. Teste concorrente real e efêmero; não usa banco local/prod.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
prisma_dir="$(cd "${script_dir}/.." && pwd)"
container="nexus-capacity-pg17-$$"
trap 'docker stop "${container}" >/dev/null 2>&1 || true' EXIT

docker run --rm -d --name "${container}" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=capacity postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "${container}" pg_isready -U postgres -d capacity >/dev/null 2>&1 && break
  sleep 0.25
done
docker exec -i "${container}" psql -v ON_ERROR_STOP=1 -U postgres -d capacity < "${script_dir}/nexus-booking-resource-capacity.pg17.sql" >/dev/null
docker exec -i "${container}" psql -v ON_ERROR_STOP=1 -U postgres -d capacity < "${prisma_dir}/migrations/20261120073000_nexus_booking_resource_capacity/migration.sql" >/dev/null
sql() { docker exec "${container}" psql -v ON_ERROR_STOP=1 -At -U postgres -d capacity -c "$1"; }

sql "
INSERT INTO \"EventType\" (\"id\",\"userId\",\"metadata\") VALUES
 (1,10,'{\"nexusServiceId\":\"11111111-1111-4111-8111-111111111111\"}'),
 (2,10,'{\"nexusServiceId\":\"22222222-2222-4222-8222-222222222222\"}'),
	 (3,10,'{\"nexusServiceId\":\"33333333-3333-4333-8333-333333333333\"}'),
	 (4,10,'{\"nexusServiceId\":\"44444444-4444-4444-8444-444444444444\"}'),
	 (5,10,'{\"nexusServiceId\":\"55555555-5555-4555-8555-555555555555\"}');
INSERT INTO \"NexusBookingResourcePool\" (\"id\",\"tenantId\",\"workspaceKey\",\"ownerUserId\",\"externalResourceId\",\"externalLocationId\",\"name\",\"capacity\",\"active\",\"sourceVersion\",\"updatedAt\") VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','99999999-9999-4999-8999-999999999999','loc-a',10,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001','Sala A',1,true,1,now()),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','99999999-9999-4999-8999-999999999999','loc-a',10,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001','Equipamento',1,true,1,now()),
	 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','99999999-9999-4999-8999-999999999999','loc-a',10,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002','Sala B',1,true,1,now()),
	 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4','99999999-9999-4999-8999-999999999999','loc-a',10,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa004','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001','Sala pico',3,true,1,now()),
	 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5','99999999-9999-4999-8999-999999999999','loc-a',10,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa005','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001','Sala historica',2,true,1,now());
INSERT INTO \"NexusEventTypeResourceBinding\" (\"id\",\"tenantId\",\"workspaceKey\",\"ownerUserId\",\"externalServiceId\",\"eventTypeId\",\"resourcePoolId\",\"units\",\"active\",\"sourceVersion\",\"updatedAt\") VALUES
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1','99999999-9999-4999-8999-999999999999','loc-a',10,'11111111-1111-4111-8111-111111111111',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',1,true,1,now()),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2','99999999-9999-4999-8999-999999999999','loc-a',10,'22222222-2222-4222-8222-222222222222',2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',1,true,1,now()),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3','99999999-9999-4999-8999-999999999999','loc-a',10,'22222222-2222-4222-8222-222222222222',2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',1,true,1,now()),
 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc4','99999999-9999-4999-8999-999999999999','loc-a',10,'33333333-3333-4333-8333-333333333333',3,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',1,true,1,now()),
	 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc5','99999999-9999-4999-8999-999999999999','loc-a',10,'33333333-3333-4333-8333-333333333333',3,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',1,true,1,now()),
	 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc6','99999999-9999-4999-8999-999999999999','loc-a',10,'44444444-4444-4444-8444-444444444444',4,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',1,true,1,now()),
	 ('cccccccc-cccc-4ccc-8ccc-ccccccccccc7','99999999-9999-4999-8999-999999999999','loc-a',10,'55555555-5555-4555-8555-555555555555',5,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',1,true,1,now());" >/dev/null

# Compromissos concluidos nao impedem reduzir a capacidade futura do recurso.
sql "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES
 ('historical-a',5,'2020-01-01 10:00Z','2020-01-01 11:00Z','accepted','{}'),
 ('historical-b',5,'2020-01-01 10:00Z','2020-01-01 11:00Z','accepted','{}');
 UPDATE \"NexusBookingResourcePool\" SET \"capacity\"=1 WHERE \"id\"='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';" >/dev/null

# O limite e o pico simultaneo, nao a soma de reservas sequenciais que continuam aceitas.
sql "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES
 ('peak-old-a',4,'2030-01-10 10:00Z','2030-01-10 11:00Z','accepted','{}'),
 ('peak-old-b',4,'2030-01-10 11:00Z','2030-01-10 12:00Z','accepted','{}'),
 ('peak-span',4,'2030-01-10 10:30Z','2030-01-10 11:30Z','accepted','{}');
 UPDATE \"NexusBookingResourcePool\" SET \"capacity\"=2 WHERE \"id\"='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';" >/dev/null
test "$(sql "SELECT count(*) FROM \"Booking\" WHERE \"uid\" LIKE 'peak-%'")" = 3
set +e
peak_error="$(docker exec "${container}" psql -v ON_ERROR_STOP=1 -U postgres -d capacity -c "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('peak-over',4,'2030-01-10 10:30Z','2030-01-10 11:30Z','accepted','{}');" 2>&1)"
peak_status=$?
set -e
test "${peak_status}" -ne 0 && grep -q NEXUS_RESOURCE_CAPACITY_EXCEEDED <<<"${peak_error}"

# Duas transações leem o mesmo slot livre; somente uma confirma após o lock do pool.
docker exec "${container}" psql -v ON_ERROR_STOP=1 -U postgres -d capacity -c \
 "BEGIN; INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('race-a',1,'2030-01-01 10:00Z','2030-01-01 11:00Z','accepted','{}'); SELECT pg_sleep(2); COMMIT;" >/dev/null &
first_pid=$!
sleep 0.25
set +e
race_error="$(docker exec "${container}" psql -v ON_ERROR_STOP=1 -U postgres -d capacity -c "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('race-b',1,'2030-01-01 10:00Z','2030-01-01 11:00Z','pending','{}');" 2>&1)"
race_status=$?
set -e
wait "${first_pid}"
test "${race_status}" -ne 0 && grep -q NEXUS_RESOURCE_CAPACITY_EXCEEDED <<<"${race_error}"
test "$(sql "SELECT count(*) FROM \"Booking\" WHERE \"uid\" IN ('race-a','race-b')")" = 1

# Falha no destino reverte também o cancelamento anterior da mesma transação.
sql "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('original',1,'2030-01-02 09:00Z','2030-01-02 10:00Z','accepted','{}'),('destino-cheio',1,'2030-01-02 11:00Z','2030-01-02 12:00Z','accepted','{}');" >/dev/null
set +e
reschedule_error="$(docker exec "${container}" psql -v ON_ERROR_STOP=1 -U postgres -d capacity -c "BEGIN; UPDATE \"Booking\" SET \"status\"='cancelled' WHERE \"uid\"='original'; INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('original-new',1,'2030-01-02 11:00Z','2030-01-02 12:00Z','accepted','{}'); COMMIT;" 2>&1)"
reschedule_status=$?
set -e
test "${reschedule_status}" -ne 0 && grep -q NEXUS_RESOURCE_CAPACITY_EXCEEDED <<<"${reschedule_error}"
test "$(sql "SELECT \"status\" FROM \"Booking\" WHERE \"uid\"='original'")" = accepted
test "$(sql "SELECT count(*) FROM \"Booking\" WHERE \"uid\"='original-new'")" = 0

# Cancelamento libera e um serviço com dois recursos aloca ambos atomicamente.
sql "UPDATE \"Booking\" SET \"status\"='cancelled' WHERE \"uid\"='destino-cheio'; INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('multi',2,'2030-01-02 11:00Z','2030-01-02 12:00Z','accepted','{}');" >/dev/null
test "$(sql "SELECT count(*) FROM \"NexusBookingResourceAllocation\" a JOIN \"Booking\" b ON b.\"id\"=a.\"bookingId\" WHERE b.\"uid\"='multi'")" = 2

# Remarcação preserva A sem override, troca A→B quando explícita e persiste o ID escolhido.
loc_a='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001'
loc_b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002'
sql "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('move-a',3,'2030-02-01 09:00Z','2030-02-01 10:00Z','accepted','{\"nexusLocationId\":\"${loc_a}\"}'); BEGIN; UPDATE \"Booking\" SET \"status\"='cancelled' WHERE \"uid\"='move-a'; INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('move-a-2',3,'2030-02-01 10:00Z','2030-02-01 11:00Z','accepted','{\"nexusLocationId\":\"${loc_a}\"}'); COMMIT;" >/dev/null
test "$(sql "SELECT \"metadata\"->>'nexusLocationId' FROM \"Booking\" WHERE \"uid\"='move-a-2'")" = "${loc_a}"
# Sucesso libera imediatamente o slot antigo na mesma unidade.
sql "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('move-a-reclaimed',3,'2030-02-01 09:00Z','2030-02-01 10:00Z','accepted','{\"nexusLocationId\":\"${loc_a}\"}');" >/dev/null
sql "BEGIN; UPDATE \"Booking\" SET \"status\"='cancelled' WHERE \"uid\"='move-a-2'; INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('move-b',3,'2030-02-01 12:00Z','2030-02-01 13:00Z','accepted','{\"nexusLocationId\":\"${loc_b}\"}'); COMMIT;" >/dev/null
test "$(sql "SELECT \"metadata\"->>'nexusLocationId' FROM \"Booking\" WHERE \"uid\"='move-b'")" = "${loc_b}"

# B lotado: troca explícita falha e conserva horário + location A da reserva original.
sql "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('keep-a',3,'2030-03-01 09:00Z','2030-03-01 10:00Z','accepted','{\"nexusLocationId\":\"${loc_a}\"}'),('busy-b',3,'2030-03-01 11:00Z','2030-03-01 12:00Z','accepted','{\"nexusLocationId\":\"${loc_b}\"}');" >/dev/null
set +e
move_error="$(docker exec "${container}" psql -v ON_ERROR_STOP=1 -U postgres -d capacity -c "BEGIN; UPDATE \"Booking\" SET \"status\"='cancelled' WHERE \"uid\"='keep-a'; INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('keep-a-failed',3,'2030-03-01 11:00Z','2030-03-01 12:00Z','accepted','{\"nexusLocationId\":\"${loc_b}\"}'); COMMIT;" 2>&1)"
move_status=$?
set -e
test "${move_status}" -ne 0 && grep -q NEXUS_RESOURCE_CAPACITY_EXCEEDED <<<"${move_error}"
test "$(sql "SELECT \"status\"||'|'||to_char(\"startTime\",'YYYY-MM-DD HH24:MI')||'|'||(\"metadata\"->>'nexusLocationId') FROM \"Booking\" WHERE \"uid\"='keep-a'")" = "accepted|2030-03-01 09:00|${loc_a}"

# A mesma sala logica em unidades diferentes tem capacidade independente.
sql "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES
 ('unit-a',3,'2030-04-01 09:00Z','2030-04-01 10:00Z','accepted','{\"nexusLocationId\":\"${loc_a}\"}'),
 ('unit-b',3,'2030-04-01 09:00Z','2030-04-01 10:00Z','accepted','{\"nexusLocationId\":\"${loc_b}\"}');" >/dev/null
test "$(sql "SELECT count(DISTINCT a.\"resourcePoolId\") FROM \"NexusBookingResourceAllocation\" a JOIN \"Booking\" b ON b.\"id\"=a.\"bookingId\" WHERE b.\"uid\" IN ('unit-a','unit-b')")" = 2

# Pagamento nao altera consumo; cancelar uma reserva paga libera a capacidade.
sql "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\",\"paid\") VALUES ('paid-cancel',1,'2030-05-01 09:00Z','2030-05-01 10:00Z','accepted','{}',true);" >/dev/null
set +e
paid_error="$(docker exec "${container}" psql -v ON_ERROR_STOP=1 -U postgres -d capacity -c "INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('paid-blocked',1,'2030-05-01 09:00Z','2030-05-01 10:00Z','accepted','{}');" 2>&1)"
paid_status=$?
set -e
test "${paid_status}" -ne 0 && grep -q NEXUS_RESOURCE_CAPACITY_EXCEEDED <<<"${paid_error}"
sql "UPDATE \"Booking\" SET \"status\"='cancelled' WHERE \"uid\"='paid-cancel'; INSERT INTO \"Booking\" (\"uid\",\"eventTypeId\",\"startTime\",\"endTime\",\"status\",\"metadata\") VALUES ('paid-released',1,'2030-05-01 09:00Z','2030-05-01 10:00Z','accepted','{}');" >/dev/null
test "$(sql "SELECT \"paid\"::text||'|'||\"status\"::text FROM \"Booking\" WHERE \"uid\"='paid-cancel'")" = "true|cancelled"

echo "PASS postgres=17 peak=concurrent_only historical=ignored concurrency=serialized reschedule=rollback_and_release paid_cancel=releases resources=atomic units=isolated"
