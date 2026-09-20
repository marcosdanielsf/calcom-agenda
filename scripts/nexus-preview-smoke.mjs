// HTTP checks for the isolated preview. Updated: 2026-09-09 07:23 BRT.
import assert from 'node:assert/strict';

const origin = 'http://localhost:3117';
const jar = new Map();
async function request(path, options = {}) {
  const response = await fetch(origin + path, {
    ...options,
    headers: { cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...options.headers },
    redirect: 'manual', signal: AbortSignal.timeout(60000),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';');
    const split = pair.indexOf('=');
    jar.set(pair.slice(0, split), pair.slice(split + 1));
  }
  return response;
}

const csrf = await (await request('/api/auth/csrf')).json();
assert.ok(csrf.csrfToken);
const login = await request('/api/auth/callback/credentials', {
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: 'preview@example.test', password: 'NexusPreviewLocal2026!', callbackUrl: origin + '/event-types', json: 'true' }),
});
assert.equal(login.status, 200);
const session = await (await request('/api/auth/session')).json();
assert.equal(session.user?.email, 'preview@example.test');
console.log('PASS: real local authentication');

for (const path of ['/event-types', '/event-types/1?tabName=setup', '/availability', '/socialfy/demonstracao']) {
  const response = await request(path);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.match(html, /<html/);
  assert.doesNotMatch(html, /NEXT_HTTP_ERROR_FALLBACK;500/);
  console.log(`PASS: HTTP page ${path}`);
}

const start = new Date();
start.setUTCDate(start.getUTCDate() + 1);
start.setUTCHours(0, 0, 0, 0);
const end = new Date(start.getTime() + 7 * 86400000);
const input = { json: { eventTypeId: 1, usernameList: ['socialfy'], eventTypeSlug: 'demonstracao', startTime: start.toISOString(), endTime: end.toISOString(), timeZone: 'America/Sao_Paulo', isTeamEvent: false } };
const slotsResponse = await request('/api/trpc/slots/getSchedule?input=' + encodeURIComponent(JSON.stringify(input)));
assert.equal(slotsResponse.status, 200);
const slots = await slotsResponse.json();
assert.ok(slots.result?.data?.json?.slots, 'Availability must contain slots');
const count = Object.values(slots.result.data.json.slots).flat().length;
assert.ok(count > 0, 'Expected available slots in seeded business hours');
console.log(`PASS: availability returned ${count} local slots`);
