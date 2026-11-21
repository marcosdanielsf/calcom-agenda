// Criado: 2026-11-21 04:42 BRT. Fronteira das chaves metadata[...] nativas da pagina publica.

const METADATA_PARAM = /^metadata\[(.*)\]$/;

export function bookingMetadataFromSearch(
  queryKeys: readonly string[],
  searchParams: Pick<URLSearchParams, "get"> | null
): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (!searchParams) return metadata;
  for (const key of queryKeys) {
    const match = METADATA_PARAM.exec(key);
    if (!match) continue;
    const value = searchParams.get(key);
    if (value !== null) metadata[match[1]] = value;
  }
  return metadata;
}
