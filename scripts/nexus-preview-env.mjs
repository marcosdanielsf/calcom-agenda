// Local preview bootstrap. Updated: 2026-09-09 07:07 BRT.
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(target)) throw new Error('Preview environment already exists; preserve it.');
const values = {
  DATABASE_URL: 'postgresql://agenda_preview@127.0.0.1:55437/agenda_preview',
  DATABASE_DIRECT_URL: 'postgresql://agenda_preview@127.0.0.1:55437/agenda_preview',
  NEXT_PUBLIC_WEBAPP_URL: 'http://localhost:3117',
  NEXT_PUBLIC_WEBSITE_URL: 'http://localhost:3117',
  NEXTAUTH_URL: 'http://localhost:3117/api/auth',
  NEXTAUTH_SECRET: randomBytes(32).toString('hex'),
  CALENDSO_ENCRYPTION_KEY: randomBytes(16).toString('hex'),
  NEXT_PUBLIC_APP_NAME: 'Agenda Nexus',
  NEXT_PUBLIC_COMPANY_NAME: 'Socialfy',
  CALCOM_TELEMETRY_DISABLED: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_LOGGER_LEVEL: '5',
  EMAIL_FROM: 'agenda@example.test',
  EMAIL_FROM_NAME: 'Agenda Nexus',
  EMAIL_SERVER_HOST: '127.0.0.1',
  EMAIL_SERVER_PORT: '11025',
};
writeFileSync(target, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
console.log('Local-only environment generated; secrets omitted.');
