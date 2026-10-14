// Criado: 2026-10-13 23:0x BRT. Novo agendamento criado pelo dono a partir da grade (clique na célula vazia)
// e pelo botão da barra, como no Google Agenda.
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";
import { enableBookingsV3, restoreBookingsV3 } from "./lib/testUtils";

test.afterEach(({ users }) => users.deleteAll());

const LONDON = "Europe/London";

function londonDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LONDON }).format(date);
}

function utcOffsetMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return (hour * 60 + minute - (date.getUTCHours() * 60 + date.getUTCMinutes()) + 1440) % 1440;
}

// Célula às 22:00Z de um dia próximo SEM troca de horário de verão em Londres (num dia de 25 horas a grade
// desalinha), fora de qualquer disponibilidade do usuário de teste (09 às 17): o Google permite, o booker não.
function slotOutsideAvailability() {
  for (let ahead = 1; ahead <= 5; ahead++) {
    const dayStart = new Date();
    dayStart.setUTCDate(dayStart.getUTCDate() + ahead);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000);
    if (utcOffsetMinutes(dayStart) !== utcOffsetMinutes(dayEnd)) continue;
    const slot = new Date(dayStart);
    slot.setUTCHours(22, 0, 0, 0);
    return slot;
  }
  throw new Error("nenhum dia sem troca de horário nos próximos 5 dias");
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
