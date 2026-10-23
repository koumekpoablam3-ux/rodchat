/**
 * Mise en forme du texte des messages, comme sur WhatsApp :
 *   *gras*   _italique_   ~barré~   `code`
 * Les marques doivent toucher le texte (« * gras * » ne fonctionne pas), ne s'ouvrent qu'en début de mot
 * (« snake_case_nom » et « 2*3*4 » restent tels quels) et ne traversent pas un retour à la ligne.
 */
export type FormatKind = "text" | "bold" | "italic" | "strike" | "code";
export type FormatToken = { kind: FormatKind; text: string };

const MARKERS: Record<string, Exclude<FormatKind, "text">> = {
  "*": "bold",
  _: "italic",
  "~": "strike",
  "`": "code",
};

const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

/** Position de la marque fermante qui correspond à celle ouverte juste avant `from`, ou -1 */
function findClose(text: string, from: number, marker: string) {
  for (let index = from; index < text.length; index++) {
    const char = text[index];
    if (char === "\n") return -1;
    if (char !== marker) continue;
    const before = text[index - 1];
    const after = text[index + 1];
    // Touche le texte (pas d'espace avant) et finit le mot (pas de lettre après)
    if (index > from && !SPACE.test(before) && !(after && WORD.test(after))) return index;
  }
  return -1;
}

export function splitFormatting(input: string): FormatToken[] {
  const tokens: FormatToken[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) tokens.push({ kind: "text", text: buffer });
    buffer = "";
  };

  let index = 0;
  while (index < input.length) {
    const char = input[index];
    const kind = MARKERS[char];
    // **gras** (habitude du Markdown) fonctionne aussi
    if (char === "*" && input[index + 1] === "*" && (index === 0 || !WORD.test(input[index - 1]))) {
      const start = index + 2;
      const close = input.indexOf("**", start);
      const body = close === -1 ? "" : input.slice(start, close);
      if (body && !body.includes("\n") && !SPACE.test(body[0]) && !SPACE.test(body[body.length - 1])) {
        flush();
        tokens.push({ kind: "bold", text: body });
        index = close + 2;
        continue;
      }
    }
    if (kind) {
      const before = input[index - 1];
      const next = input[index + 1];
      const opens = !before || (!WORD.test(before) && before !== char);
      if (opens && next && !SPACE.test(next) && next !== char) {
        const close = findClose(input, index + 1, char);
        if (close !== -1) {
          flush();
          tokens.push({ kind, text: input.slice(index + 1, close) });
          index = close + 1;
          continue;
        }
      }
    }
    buffer += char;
    index += 1;
  }
  flush();
  return tokens;
}

const EMOJI_ONLY =
  /^(?:(?:\p{Regional_Indicator}{2}|[\p{Extended_Pictographic}\u20E3](?:\uFE0F|\p{Emoji_Modifier})*(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*)\s*){1,3}$/u;

/** Un message de 1 à 3 emojis et rien d'autre s'affiche en grand */
export function isEmojiOnly(text: string | null | undefined) {
  const value = (text ?? "").trim();
  return value.length > 0 && value.length <= 40 && EMOJI_ONLY.test(value);
}

/** Le texte sans les marques de mise en forme (*gras*, _italique_…), pour les aperçus d'une ligne : liste, notification */
export function stripFormatting(text: string): string {
  return splitFormatting(text)
    .map((token) => (token.kind === "text" || token.kind === "code" ? token.text : stripFormatting(token.text)))
    .join("");
}
