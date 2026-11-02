// Criado: 2026-11-02 BRT. Pagina publica do calendario de equipe (rodizio e coletivo). O motor
// ja calcula horario e escolhe o atendente; esta versao MIT veio sem a rota /team/<slug>/<tipo>,
// que e para onde os proprios e-mails de remarcar apontam.
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { EventRepository } from "@calcom/features/eventtypes/repositories/EventRepository";
import slugify from "@calcom/lib/slugify";
import {
  processReschedule,
  processSeatedEvent,
  type Props,
} from "@server/lib/[user]/[type]/getServerSideProps";
import type { GetServerSidePropsContext } from "next";
import { z } from "zod";

const paramsSchema = z.object({
  slug: z.string().transform((s) => slugify(s)),
  type: z.string().transform((s) => slugify(s)),
});

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const session = await getServerSession({ req: context.req });
  const { slug: teamSlug, type: slug } = paramsSchema.parse(context.params);
  const { rescheduleUid, bookingUid } = context.query;
  const allowRescheduleForCancelledBooking = context.query.allowRescheduleForCancelledBooking === "true";

  const eventData = await EventRepository.getPublicEvent(
    { username: teamSlug, eventSlug: slug, isTeamEvent: true, org: null },
    session?.user?.id
  );
  if (!eventData) return { notFound: true } as const;

  const props: Props = {
    eventData,
    user: teamSlug,
    slug,
    isBrandingHidden: true,
    isSEOIndexable: false,
    themeBasis: teamSlug,
    bookingUid: bookingUid ? `${bookingUid}` : null,
    rescheduleUid: null,
    orgBannerUrl: null,
  };
  if (rescheduleUid) {
    const result = await processReschedule({ props, rescheduleUid, session, allowRescheduleForCancelledBooking });
    if (result) return result;
  } else if (bookingUid) {
    const result = await processSeatedEvent({ props, bookingUid, allowRescheduleForCancelledBooking });
    if (result) return result;
  }
  return { props };
};
