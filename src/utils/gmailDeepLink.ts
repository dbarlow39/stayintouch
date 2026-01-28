const CHARSET_FULL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CHARSET_REDUCED = "BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz";

// Ported from ArsenalRecon's GmailURLDecoder (MIT):
// https://github.com/ArsenalRecon/GmailURLDecoder
function transform(token: string, charsetIn: string, charsetOut: string): string {
  const sizeStr = token.length;
  const sizeIn = charsetIn.length;
  const sizeOut = charsetOut.length;

  const alphMap = new Map<string, number>();
  for (let i = 0; i < sizeIn; i += 1) alphMap.set(charsetIn[i], i);

  const inStrIdx: number[] = [];
  for (let i = sizeStr - 1; i >= 0; i -= 1) {
    const idx = alphMap.get(token[i]);
    if (idx === undefined) throw new Error("Invalid token character");
    inStrIdx.push(idx);
  }

  const outStrIdx: number[] = [];
  for (let i = inStrIdx.length - 1; i >= 0; i -= 1) {
    let offset = 0;

    for (let j = 0; j < outStrIdx.length; j += 1) {
      let idx = sizeIn * outStrIdx[j] + offset;
      if (idx >= sizeOut) {
        const rest = idx % sizeOut;
        offset = (idx - rest) / sizeOut;
        idx = rest;
      } else {
        offset = 0;
      }
      outStrIdx[j] = idx;
    }

    while (offset) {
      const rest = offset % sizeOut;
      outStrIdx.push(rest);
      offset = (offset - rest) / sizeOut;
    }

    offset = inStrIdx[i];
    let j = 0;
    while (offset) {
      if (j >= outStrIdx.length) outStrIdx.push(0);
      let idx = outStrIdx[j] + offset;
      if (idx >= sizeOut) {
        const rest = idx % sizeOut;
        offset = (idx - rest) / sizeOut;
        idx = rest;
      } else {
        offset = 0;
      }
      outStrIdx[j] = idx;
      j += 1;
    }
  }

  const outBuff: string[] = [];
  for (let i = outStrIdx.length - 1; i >= 0; i -= 1) outBuff.push(charsetOut[outStrIdx[i]]);
  return outBuff.join("");
}

function base64EncodeAscii(input: string): string {
  if (typeof globalThis.btoa !== "function") throw new Error("btoa not available");
  return globalThis.btoa(input);
}

/**
 * Convert a legacy Gmail view token (hex from Gmail API, e.g. `19c01b...`) into
 * a Gmail new UI view token (e.g. `FMfcgz...`) usable in `#all/{token}`.
 *
 * IMPORTANT:
 * - Gmail “new UI” view tokens are an obfuscated form of the legacy hex view token.
 * - Per ArsenalRecon GmailURLDecoder research, decoding a new token yields
 *   `thread-f:{decimalLegacy}` (or `msg-f:{decimalLegacy}`), where the decimal value
 *   is the legacy hex interpreted as an integer.
 * - When *encoding* (legacy → new), Gmail effectively base64-encodes a payload
 *   that omits the leading `thread-` prefix:
 *     - thread view: `f:{decimalLegacy}`
 *     - message view: `msg-f:{decimalLegacy}`
 *   then removes base64 padding and applies a reduced-charset transform.
 */
export function gmailNewUiTokenFromLegacyHex(
  legacyHex: string,
  kind: "thread" | "msg" = "thread"
): string | null {
  const hex = (legacyHex ?? "").trim();
  if (!/^[0-9a-f]{15,16}$/i.test(hex)) return null;

  try {
    const decimal = BigInt(`0x${hex}`).toString(10);

    // Encoding payload (see docstring above):
    // - thread tokens encode `f:{decimal}`
    // - message tokens encode `msg-f:{decimal}`
    const decoded = kind === "msg" ? `msg-f:${decimal}` : `f:${decimal}`;
    const b64 = base64EncodeAscii(decoded).replace(/=+$/g, "");
    return transform(b64, CHARSET_FULL, CHARSET_REDUCED);
  } catch {
    return null;
  }
}

function gmailBaseUrl(accountIndex?: number | null): string {
  // When a user has multiple Google accounts signed in, Gmail routes like /mail/u/0/
  // are the only reliable way to target the correct mailbox.
  if (typeof accountIndex === "number" && Number.isFinite(accountIndex)) {
    return `https://mail.google.com/mail/u/${accountIndex}/`;
  }
  return "https://mail.google.com/mail/";
}

export function gmailUrlForLegacyHexWithAccount(
  legacyHex: string,
  userIndexOrKind: number | "thread" | "msg" | "auto" = 0,
  accountIndex?: number | null
): string | null {
  // Backwards compatibility: older callers passed a userIndex.
  if (typeof userIndexOrKind === "number") void userIndexOrKind;

  const kind = typeof userIndexOrKind === "string" ? userIndexOrKind : "thread";
  const kindsToTry: Array<"thread" | "msg"> =
    kind === "auto" ? ["thread", "msg"] : [kind];

  let token: string | null = null;
  for (const k of kindsToTry) {
    token = gmailNewUiTokenFromLegacyHex(legacyHex, k);
    if (token) break;
  }
  if (!token) return null;

  // Use #all/ since the message might be archived or in another folder.
  return `${gmailBaseUrl(accountIndex)}#all/${token}`;
}

export function gmailUrlForLegacyHex(
  legacyHex: string,
  userIndexOrKind: number | "thread" | "msg" | "auto" = 0
): string | null {
  return gmailUrlForLegacyHexWithAccount(legacyHex, userIndexOrKind, undefined);
}
