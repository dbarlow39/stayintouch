/**
 * Extracts the first name(s) from a client/seller name string.
 * Handles multiple owners separated by "and", "&", "+", or ",".
 * e.g. "Jim and Carol Guthrie" -> "Jim and Carol"
 */
export const getClientFirstNames = (name?: string | null, fallback = "there"): string => {
  if (!name || !name.trim()) return fallback;

  const parts = name
    .split(/\s*(?:&|\+|,|\band\b)\s*/i)
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);

  if (parts.length === 0) return fallback;
  return parts.join(" and ");
};
