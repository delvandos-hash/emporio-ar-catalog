export function resolveImaratImageUrl(value, origin) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^https:\/\//i.test(raw)) return raw;
  if (!origin) return '';
  try {
    const base = String(origin).endsWith('/') ? String(origin) : String(origin) + '/';
    return new URL(raw, base).toString();
  } catch {
    return '';
  }
}
