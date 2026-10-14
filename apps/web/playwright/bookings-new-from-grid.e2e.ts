// Criado: 2026-10-13 23:0x BRT. Novo agendamento criado pelo dono a partir da grade (clique na célula vazia)
// e pelo botão da barra, como no Google Agenda.
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { Fixtures } from "./lib/fixtures";
import { test } from "./lib/fixtures";

test.afterEach(({ users }) => users.deleteAll());

async function enableBookingsV3(prisma: Fixtures["prisma"]) {
  const existing = await prisma.feature.findUnique({ where: { slug: "bookings-v3" } });
  await prisma.feature.upsert({
    where: { slug: "bookings-v3" },
    update: { enabled: true },
    create: { slug: "bookings-v3", enabled: true, type: "OPERATIONAL" },
  });
  return existing;
}

async function restoreBookingsV3(prisma: Fixtures["prisma"], existing: { enabled: boolean } | null) {
  if (existing) {
    await prisma.feature.update({ where: { slug: "bookings-v3" }, data: { enabled: existing.enabled } });
  } else {
    await prisma.feature.deleteMany({ where: { slug: "bookings-v3" } });
  }
}

const LONDON = "Europe/London";

function londonDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LONDON }).format(date);
}

// Célula de amanhã às 22:00Z: fora de qualquer horário de disponibilidade do usuário de teste (09 às 17),
// justamente o que o Google Agenda permite e a reserva pública recusaria.
function slotOutsideAvailability() {
  const slot = new Date();
  slot.setUTCDate(slot.getUTCDate() + 1);
  slot.setUTCHours(22, 0, 0, 0);
  return slot;
}

async function openWeek(page: Page, date: string) {
  await page.goto(`/bookings/upcoming?view=calendar&range=week&date=${date}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("booking-calendar-grid")).toBeVisible();
}

test.describe("Novo agendamento pela grade", () => {
  test("clicar na célula vazia abre a folha com o horário e salvar põe a reserva na grade", async ({
    page,
    users,
    prisma,
  }) => {
    const existingFlag = await enableBookingsV3(prisma);
    try {
      const user = await users.create();
      await user.apiLogin();
      const slot = slotOutsideAvailability();
      await openWeek(page, londonDate(slot));

      const cell = page.locator(`[data-testid="calendar-empty-cell"][data-slot="${slot.toISOString()}"]`);
      await cell.scrollIntoViewIfNeeded();
      await cell.click();

      const sheet = page.getByTestId("new-booking-sheet");
      await expect(sheet).toBeVisible();
      const expectedTime = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: LONDON,
      }).format(slot);
      await expect(page.getByTestId("new-booking-time")).toHaveValue(expectedTime);
      await expect(page.getByTestId("new-booking-date")).toHaveValue(londonDate(slot));

      await page.getByTestId("new-booking-name").fill("Cliente Grade");
      await page.getByTestId("new-booking-email").fill("cliente.grade@example.com");
      await page.getByTestId("new-booking-phone").fill("11 99999-8888");
      await page.getByTestId("new-booking-submit").click();

      await expect(sheet).toBeHidden();
      const event = page.locator("[data-booking-calendar-event]", { hasText: "Cliente Grade" });
      await expect(event).toBeVisible();

      const booking = await prisma.booking.findFirst({
        where: { userId: user.id, attendees: { some: { email: "cliente.grade@example.com" } } },
        select: {
          startTime: true,
          endTime: true,
          status: true,
          attendees: { select: { phoneNumber: true } },
        },
      });
      expect(booking?.startTime.toISOString()).toBe(slot.toISOString());
      expect(booking?.endTime.getTime()).toBe(slot.getTime() + 30 * 60 * 1000);
      expect(booking?.status).toBe("ACCEPTED");
      expect(booking?.attendees[0]?.phoneNumber).toBe("+5511999998888");
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });

  test("botão Novo agendamento abre a folha na lista e no calendário", async ({ page, users, prisma }) => {
    const existingFlag = await enableBookingsV3(prisma);
    try {
      const user = await users.create();
      await user.apiLogin();

      await page.goto("/bookings/upcoming", { waitUntil: "domcontentloaded" });
      await page.getByTestId("new-booking-button").click();
      await expect(page.getByTestId("new-booking-sheet")).toBeVisible();
      await page.getByTestId("new-booking-cancel").click();
      await expect(page.getByTestId("new-booking-sheet")).toBeHidden();

      await openWeek(page, londonDate(new Date()));
      await page.getByTestId("new-booking-button").click();
      await expect(page.getByTestId("new-booking-sheet")).toBeVisible();
      await expect(page.getByTestId("new-booking-summary")).toContainText(/\d{2}:\d{2} a \d{2}:\d{2}/);
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });
});
