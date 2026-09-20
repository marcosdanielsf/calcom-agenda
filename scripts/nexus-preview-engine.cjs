// Updated: 2026-09-09 08:06 BRT. Real HTTP/service; synthetic in-memory dependencies.
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const gatewayRequire = createRequire(require('node:path').resolve(__dirname, '../../../package.json'));
const express = gatewayRequire('express');
const { createPublicBookingRouter } = gatewayRequire('./dist/api/public-booking.controller.js');
const { createBookingReservationService, BookingCalendarRejectedError } = gatewayRequire('./dist/services/booking-events/booking-reservation.service.js');
const tokenHash = createHash('sha256').update('synthetic_local_preview_token_000000000001').digest('hex');
const page = { id: 'preview-page', calendarId: 'synthetic-calendar', workspaceKey: 'synthetic-workspace', timezone: 'America/Sao_Paulo' };
const reservations = new Map();
const occupied = new Set();
let calendarCalls = 0;
const repository = {
  async lookupStatus({ pageId, requestKeyHash }) {
    return pageId === page.id ? reservations.get(requestKeyHash)?.status ?? null : null;
  },
  async reserve(input) {
    const id = input.requestKeyHash;
    const previous = reservations.get(id);
    if (previous && previous.payloadHash !== input.payloadHash) throw new Error('INVALID_BOOKING_PAYLOAD_REPLAY');
    if (!previous) reservations.set(id, { id, status: 'reserved', payloadHash: input.payloadHash });
    return { ...reservations.get(id) };
  },
  async startExternalEffect(row) {
    const stored = reservations.get(row.id);
    if (stored.status !== 'reserved') throw new Error('BOOKING_EFFECT_ALREADY_STARTED');
    stored.status = 'side_effect_started';
    return { ...stored };
  },
  async complete(row, status, providerBookingId) {
    if (!row.id || !reservations.has(row.id)) throw new Error('BOOKING_RESERVATION_ID_REQUIRED');
    Object.assign(reservations.get(row.id), { status, providerBookingId });
    return { ...reservations.get(row.id) };
  },
};
const calendar = {
  async findAvailable({ startAt, endAt }) {
    const slots = [];
    for (let value = Math.ceil(Date.parse(startAt) / 1800000) * 1800000; value < Date.parse(endAt); value += 1800000) {
      const date = new Date(value), hour = date.getUTCHours();
      if (value <= Date.now() || ![1, 2, 3, 4, 5].includes(date.getUTCDay()) || hour < 12 || hour >= 21 || occupied.has(date.toISOString())) continue;
      slots.push({ startAt: date.toISOString(), endAt: new Date(value + 1800000).toISOString() });
    }
    return slots;
  },
  async create({ slot, contact }) {
    calendarCalls += 1;
    if (occupied.has(slot.startAt) || contact.email === 'rejected@example.test') throw new BookingCalendarRejectedError();
    occupied.add(slot.startAt);
    if (contact.email === 'processing@example.test') throw new Error('Synthetic ambiguous provider response');
    return { providerBookingId: `preview-${calendarCalls}` };
  },
};
const app = express();
app.get('/health', (_, res) => res.json({ fixture: true, externalEffects: false, calendarCalls, reservations: reservations.size, confirmed: [...reservations.values()].filter(r => r.status === 'confirmed').length }));
app.use('/api/nexus/agenda/publica', createPublicBookingRouter(createBookingReservationService(repository, calendar, { resolveActivePage: async (hash) => hash === tokenHash ? page : null })));
const port = Number(process.env.NEXUS_PREVIEW_ENGINE_PORT || 3118);
if (![3118, 3119].includes(port)) throw new Error('Only isolated preview ports are allowed');
app.listen(port, '127.0.0.1', () => console.log(`Synthetic Nexus preview engine on 127.0.0.1:${port}; no external calendar or messaging.`));
