/**
 * Builds canonical Dande category URLs.
 * new URL() is intentional: concatenating DANDE_BASE + "/category/" can
 * produce "//category/" when the environment variable ends in a slash.
 * Nuvemshop may serve a generic listing for those malformed paths.
 */
export function buildDandeUrl(base, path, page = 1) {
  const url = new URL(path, base);
  url.searchParams.delete("page");
  if (Number(page) > 1) url.searchParams.set("page", String(Number(page)));
  return url.toString();
}
