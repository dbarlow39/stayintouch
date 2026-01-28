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
 * a Gmail new UI view token (e.g. `FMfcgz...`) usable in `#inbox/{token}`.
 */
function gmailNewUiTokenFromLegacyHexWithPrefix(
  legacyHex: string,
  prefix: "thread-f" | "msg-f"
): string | null {
  const hex = (legacyHex ?? "").trim();
  if (!/^[0-9a-f]{15,16}$/i.test(hex)) return null;

  try {
    const decimal = BigInt(`0x${hex}`).toString(10);

    // Best-effort: Gmail token formats are not guaranteed stable across rollouts.
    // This matches the common "thread-f:{decimal}" form described by ArsenalRecon.
    // Some Gmail deep-links require a message token: "msg-f:{decimal}".
    const decoded = `${prefix}:${decimal}`;
    const b64 = base64EncodeAscii(decoded).replace(/=+$/g, "");
    return transform(b64, CHARSET_FULL, CHARSET_REDUCED);
  } catch {
    return null;
  }
}

export function gmailNewUiTokenFromLegacyHex(legacyHex: string): string | null {
  return gmailNewUiTokenFromLegacyHexWithPrefix(legacyHex, "thread-f");
}

export function gmailUrlForLegacyHex(
  legacyHex: string,
  userIndexOrKind: number | "thread" | "msg" | "auto" = 0
): string | null {
  // Backwards compatibility: older callers passed a userIndex.
  if (typeof userIndexOrKind === "number") void userIndexOrKind;

  const kind = typeof userIndexOrKind === "string" ? userIndexOrKind : "thread";
  const kindsToTry: Array<"msg" | "thread"> =
    kind === "auto" ? ["msg", "thread"] : [kind];

  let token: string | null = null;
  for (const k of kindsToTry) {
    token = gmailNewUiTokenFromLegacyHexWithPrefix(
      legacyHex,
      k === "msg" ? "msg-f" : "thread-f"
    );
    if (token) break;
  }

  if (!token) return null;
  // Use #all/ instead of #inbox/ since the message might be archived or in another folder.
  // Important: avoid forcing /u/0 because users may have multiple Gmail accounts and the
  // connected account might be /u/1 (or more), causing "conversation could not be loaded".
  // We keep the `userIndexOrKind` number form for backwards compatibility but do not use it.
  return `https://mail.google.com/mail/#all/${token}`;
}
