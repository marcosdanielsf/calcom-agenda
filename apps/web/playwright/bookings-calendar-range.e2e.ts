import { BookingStatus } from "@calcom/prisma/enums";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { applySelectFilter } from "./filter-helpers";
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
const HOUR_MS = 60 * 60 * 1000;

function londonDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LONDON }).format(date);
}

// O navegador do Playwright roda em Europe/London e /bookings/upcoming só lista reserva que termina
// depois de agora: as reservas nascem relativas a agora (+1 h e +3 h). Perto da meia-noite de Londres
// (as duas cruzariam o dia) vão para amanhã às 10:00Z, que cai no mesmo dia em Londres.
function bookingSlots() {
  const now = new Date();
  let first = new Date(now.getTime() + HOUR_MS);
  const lastEnd = new Date(first.getTime() + 3 * HOUR_MS);
  if (londonDate(first) !== londonDate(lastEnd)) {
    first = new Date(now.getTime() + 24 * HOUR_MS);
    first.setUTCHours(10, 0, 0, 0);
  }
  const second = new Date(first.getTime() + 2 * HOUR_MS);
  return {
    alphaStart: first,
    alphaEnd: new Date(first.getTime() + HOUR_MS),
    betaStart: second,
    betaEnd: new Date(second.getTime() + HOUR_MS),
    day: londonDate(first),
    today: londonDate(now),
  };
}

async function setup({ users, bookings, prisma }: Pick<Fixtures, "users" | "bookings" | "prisma">) {
  const existingFlag = await enableBookingsV3(prisma);
  const slots = bookingSlots();
  const user = await users.create();
  const [typeA, typeB] = user.eventTypes;

  const alpha = await bookings.create(user.id, user.username, typeA.id, {
    title: "Reserva Alfa",
    status: BookingStatus.ACCEPTED,
    startTime: slots.alphaStart,
    endTime: slots.alphaEnd,
    attendees: { createMany: { data: [{ name: "Ana", email: "ana@example.com", timeZone: "UTC" }] } },
  });
  const beta = await bookings.create(user.id, user.username, typeB.id, {
    title: "Reserva Beta",
    status: BookingStatus.ACCEPTED,
    startTime: slots.betaStart,
    endTime: slots.betaEnd,
    attendees: { createMany: { data: [{ name: "Beto", email: "beto@example.com", timeZone: "UTC" }] } },
  });

  await user.apiLogin();
  return { user, typeA, typeB, alpha, beta, existingFlag, slots };
}

async function openCalendar(page: Page, query = "", date?: string) {
  const dateParam = date ? `&date=${date}` : "";
  await page.goto(`/bookings/upcoming?view=calendar${query}${dateParam}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("booking-range-toggle")).toBeVisible();
}

test.describe("Visao de calendario das reservas", () => {
  test("alternador troca lista e grade sem recarregar", async ({ page, users, bookings, prisma }) => {
    const { existingFlag, alpha } = await setup({ users, bookings, prisma });
    try {
      await page.goto("/bookings/upcoming", { waitUntil: "domcontentloaded" });
      await expect(page.locator(`[data-booking-uid="${alpha.uid}"]`)).toBeVisible();
      await page.evaluate(() => {
        (window as unknown as { __semRecarga: boolean }).__semRecarga = true;
      });

      await page.getByTestId("booking-view-calendar").click();
      await expect(page.getByTestId("booking-calendar-grid")).toBeVisible();

      await page.getByTestId("booking-view-list").click();
      await expect(page.getByTestId("booking-calendar-grid")).toBeHidden();
      await expect(page.locator(`[data-booking-uid="${alpha.uid}"]`)).toBeVisible();

      const preserved = await page.evaluate(
        () => (window as unknown as { __semRecarga?: boolean }).__semRecarga
      );
      expect(preserved).toBe(true);
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });

  test("semana atual abre com a linha de agora", async ({ page, users, bookings, prisma }) => {
    const { existingFlag, slots } = await setup({ users, bookings, prisma });
    try {
      await openCalendar(page, "&range=day", slots.today);
      await expect(page.getByTestId("booking-calendar-grid")).toBeVisible();
      await expect(page.getByTestId("calendar-current-time")).toBeAttached();
      const [year, month, day] = slots.today.split("-").map(Number);
      const expected = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(Date.UTC(year, month - 1, day))
      );
      await expect(page.getByTestId("pick-date")).toHaveText(expected);
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });

  test("reserva aparece na coluna do dia com titulo e hora", async ({ page, users, bookings, prisma }) => {
    const { existingFlag, alpha, slots } = await setup({ users, bookings, prisma });
    try {
      await openCalendar(page, "&range=week", slots.day);
      const event = page.locator(`[data-booking-calendar-event][data-booking-uid="${alpha.uid}"]`);
      await expect(event).toBeVisible();
      await expect(event).toContainText("Reserva Alfa");
      await expect(event).toContainText(/\d{1,2}:\d{2}/);
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });

  test("filtrar por tipo de agendamento some com as reservas dos outros tipos", async ({
    page,
    users,
    bookings,
    prisma,
  }) => {
    const { existingFlag, alpha, beta, typeA, slots } = await setup({ users, bookings, prisma });
    try {
      await openCalendar(page, "&range=week", slots.day);
      await expect(page.locator(`[data-booking-uid="${alpha.uid}"]`)).toBeVisible();
      await expect(page.locator(`[data-booking-uid="${beta.uid}"]`)).toBeVisible();

      await applySelectFilter(page, "eventTypeId", typeA.title);

      await expect(page.locator(`[data-booking-uid="${alpha.uid}"]`)).toBeVisible();
      await expect(page.locator(`[data-booking-uid="${beta.uid}"]`)).toBeHidden();
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });

  test("clicar na reserva abre a ficha", async ({ page, users, bookings, prisma }) => {
    const { existingFlag, alpha, slots } = await setup({ users, bookings, prisma });
    try {
      await openCalendar(page, "&range=week", slots.day);
      await page.locator(`[data-booking-calendar-event][data-booking-uid="${alpha.uid}"]`).click();
      const sheet = page.locator('[role="dialog"]');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByTestId("booking-sheet-title")).toHaveText("Reserva Alfa");
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });

  test("Mes mostra a contagem por dia e clicar no dia abre a semana dele", async ({
    page,
    users,
    bookings,
    prisma,
  }) => {
    const { existingFlag, alpha, slots } = await setup({ users, bookings, prisma });
    try {
      await openCalendar(page, "&range=month", slots.day);
      await expect(page.getByTestId("booking-month-grid")).toBeVisible();

      const busyDay = page.getByTestId(`booking-month-day-${slots.day}`);
      await expect(busyDay).toHaveAttribute("data-count", "2");
      await expect(busyDay.getByTestId("booking-month-count")).toHaveText("2");

      await busyDay.click();
      await expect(page).toHaveURL(/range=week/);
      await expect(page.getByTestId("booking-month-grid")).toBeHidden();
      await expect(page.locator(`[data-booking-uid="${alpha.uid}"]`)).toBeVisible();
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });

  test("no celular (390x844) a grade existe e abre em Dia", async ({ page, users, bookings, prisma }) => {
    const { existingFlag, alpha, slots } = await setup({ users, bookings, prisma });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await openCalendar(page, "", slots.day);

      await expect(page.getByTestId("booking-calendar-grid")).toBeVisible();
      await expect(page.getByTestId("booking-range-day")).toHaveAttribute("data-state", "on");
      await expect(page.locator(`[data-booking-uid="${alpha.uid}"]`)).toBeVisible();

      const overflowX = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflowX).toBe(false);
    } finally {
      await restoreBookingsV3(prisma, existingFlag);
    }
  });
});
