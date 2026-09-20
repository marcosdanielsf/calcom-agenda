// Synthetic preview only. Updated: 2026-09-09 07:07 BRT.
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../packages/prisma/generated/prisma/client';

async function main() {
  const connectionString = process.env.DATABASE_URL ?? '';
  const target = new URL(connectionString);
  if (target.hostname !== '127.0.0.1' || target.port !== '55437' || target.pathname !== '/agenda_preview') {
    throw new Error('Refusing to seed anything except the isolated preview database.');
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const email = 'preview@example.test';
    const user = await db.user.upsert({
      where: { email_username: { email, username: 'socialfy' } },
      create: {
        email, username: 'socialfy', name: 'Socialfy',
        emailVerified: new Date(), completedOnboarding: true,
        timeZone: 'America/Sao_Paulo', locale: 'pt-BR', timeFormat: 24,
        hideBranding: true, theme: 'light', appTheme: 'light',
      },
      update: {},
      select: { id: true, defaultScheduleId: true },
    });
    const hash = await bcrypt.hash('NexusPreviewLocal2026!', 12);
    await db.userPassword.upsert({ where: { userId: user.id }, create: { userId: user.id, hash }, update: { hash } });
    let scheduleId = user.defaultScheduleId;
    if (!scheduleId) {
      const schedule = await db.schedule.create({
        data: {
          userId: user.id, name: 'Horário comercial', timeZone: 'America/Sao_Paulo',
          availability: { create: [{ days: [1, 2, 3, 4, 5], startTime: new Date('1970-01-01T09:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') }] },
        },
        select: { id: true },
      });
      scheduleId = schedule.id;
      await db.user.update({ where: { id: user.id }, data: { defaultScheduleId: scheduleId }, select: { id: true } });
    }
    const existing = await db.eventType.findFirst({ where: { userId: user.id, slug: 'demonstracao' }, select: { id: true } });
    if (!existing) {
      await db.eventType.create({
        data: {
          userId: user.id, users: { connect: { id: user.id } }, scheduleId,
          title: 'Demonstração Socialfy', slug: 'demonstracao', length: 30,
          description: 'Conheça as soluções Socialfy para atendimento e vendas.',
          locations: [{ type: 'inPerson', address: 'Reunião de demonstração' }],
          metadata: { disableStandardEmails: { all: { attendee: true, host: true } } },
        },
        select: { id: true },
      });
    }
    if (process.env.NEXUS_PREVIEW_BRIDGE === '1') {
      const event = await db.eventType.findFirstOrThrow({ where: { userId: user.id, slug: 'demonstracao' }, select: { id: true } });
      await db.eventType.update({ where: { id: event.id }, data: {
        disableGuests: true,
        bookingFields: [
          { name: 'attendeePhoneNumber', type: 'phone', label: 'Telefone com código do país', required: true, hidden: false, editable: 'system-but-optional' },
          { name: 'nexusTransactionalMessages', type: 'boolean', label: 'Autorizo mensagens de confirmação e lembretes sobre esta reserva.', required: true, hidden: false },
        ],
      }, select: { id: true } });
    }
    console.log('Preview seeded: one local operator, schedule and event type. No external credentials.');
  } finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
