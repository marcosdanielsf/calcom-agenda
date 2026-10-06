import { WEBAPP_URL } from "@calcom/lib/constants";

const usernamePair = "anna+brian";

export const withProfileUsernamePlusHostname = (tip: string, webappUrl = WEBAPP_URL) =>
  tip.replace(/[a-z0-9.-]+\/anna\+brian/gi, `${new URL(webappUrl).hostname}/${usernamePair}`);
