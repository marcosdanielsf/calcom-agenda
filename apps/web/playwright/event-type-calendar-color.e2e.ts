// Criado: 2026-10-13 23:3x BRT. Cor na agenda no padrão do Google Agenda: paleta na aba Aparência,
// reserva pintada na grade semanal e no Mês.
import { BookingStatus } from "@calcom/prisma/enums";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { Fixtures } from "./lib/fixtures";
import { test } from "./lib/fixtures";
import { gotoFirstEventType, saveEventType } from "./lib/testUtils";

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

const PEACOCK = "#039be5";
const PEACOCK_RGB = "rgb(3, 155, 229)";
const HOUR_MS = 60 * 60 * 1000;

function londonDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}

async function openAppearanceTab(page: Page) {
  await page.goto("/event-types");
  await page.waitForSelector('[data-testid="event-types"]');
  await gotoFirstEventType(page);
  const editorId = new URL(page.url()).pathname.split("/").pop();
  const editorUrl = `/event-types/${editorId}?tabName=appearance`;
  await page.goto(editorUrl);
  await expect(page.getByTestId("nexus-calendar-color")).toBeVisible();
  return { editorUrl, eventTypeId: Number(editorId) };
}

test.describe("Cor na agenda", () => {
  test("escolher uma cor da paleta salva nos dois temas e volta marcada ao reabrir", async ({
    page,
    users,
    prisma,
  }) => {
    const user = await users.create();
    await user.apiLogin();
    const { editorUrl, eventTypeId } = await openAppearanceTab(page);

    await expect(page.getByTestId("nexus-color-none")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("nexus-color-peacock").click();
    await expect(page.getByTestId("nexus-color-peacock")).toHaveAttribute("aria-checked", "true");
    await saveEventType(page);

    const saved = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      select: { eventTypeColor: true },
    });
    expect(saved?.eventTypeColor).toEqual({ lightEventTypeColor: PEACOCK, darkEventTypeColor: PEACOCK });

    await page.goto(editorUrl);
    await expect(page.getByTestId("nexus-color-peacock")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("nexus-color-none")).toHaveAttribute("aria-pressed", "false");

    await page.getByTestId("nexus-color-none").click();
    await saveEventType(page);
    const cleared = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      select: { eventTypeColor: true },
    });
    expect(cleared?.eventTypeColor).toBeNull();
  });

  test("reserva do tipo aparece com a cor na grade da semana e no mês", async ({
    page,
    users,
    bookings,
    prisma,
  }) => {
    const existingFlag = await enableBookingsV3(prisma);
    try {
      const user = await users.create();
      const [eventType] = user.eventTypes;
      await prisma.eventType.update({
        where: { id: eventType.id },
        data: { eventTypeColor: { lightEventTypeColor: PEACOCK, darkEventTypeColor: PEACOCK } },
      });
      const start = new Date(Date.now() + 24 * HOUR_MS);
      start.setUTCHours(10, 0, 0, 0);
      const booking = await bookings.create(user.id, user.username, eventType.id, {
        title: "Reserva Pavão",
        status: BookingStatus.ACCEPTED,
        startTime: start,
        endTime: new Date(start.getTime() + HOUR_MS),
        attendees: { createMany: { data: [{ name: "Ana", email: "ana@example.com", timeZone: "UTC" }] } },
      });
      await user.apiLogin();

      await page.goto(`/bookings/upcoming?view=calendar&range=week&date=${londonDate(start)}`, {
        waitUntil: "domcontentloaded",
      });
      const event = page.locator(`[data-booking-calendar-event][data-booking-uid="${booking.uid}"]`);
      await expect(event).toBeVisible();
      await expect(event.locator("div").first()).toHaveCSS("background-color", PEACOCK_RGB);

      await page.getByTestId("booking-range-month").click();
      const title = page.getByTestId("booking-month-title").filter({ hasText: "Reserva Pavão" });
      await expect(title).toBeVisible();
      await expect(title).toHaveCSS("border-left-color", PEACOCK_RGB);
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });
});
