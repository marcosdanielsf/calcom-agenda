// Updated: 2026-09-09 08:06 BRT. Read-only recovery; request key stays out of URLs.
import type { NextApiRequest, NextApiResponse } from "next";
import { HttpError } from "@calcom/lib/http-error";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import getIP from "@calcom/lib/getIP";
import { readNexusBookingStatus, usesNexusBooking } from "@calcom/lib/nexus-booking/server";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { piiHasher } from "@calcom/lib/server/PiiHasher";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") throw new HttpError({ statusCode: 405, message: "Método não permitido" });
  if (!usesNexusBooking()) throw new HttpError({ statusCode: 404, message: "Agenda indisponível" });
  const id = req.query.eventTypeId;
  if (typeof id !== "string" || !/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new HttpError({ statusCode: 400, message: "Agenda inválida" });
  await checkRateLimitAndThrowError({ rateLimitingType: "core", identifier: `agendaStatus:${piiHasher.hash(getIP(req))}` });
  return readNexusBookingStatus({ eventTypeId: Number(id) }, req.headers["idempotency-key"]);
}

export default defaultResponder(handler, "/api/book/status");
