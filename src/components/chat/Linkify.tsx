import { Fragment } from "react";
import { splitFormatting } from "@/lib/formatting";
import { splitMentions } from "@/lib/mentions";

const URL_SPLIT = /(https?:\/\/[^\s<>"'`]+)/gi;
const TRAILING = /[.,;:!?)\]}»”’]+$/;

type LinkifyProps = {
  text: string;
  /** Noms d'utilisateur des membres de la discussion : leurs « @pseudo » sont mis en valeur */
  mentionable?: Set<string>;
  /** Mon nom d'utilisateur : ma propre mention ressort davantage */
  meUsername?: string;
};

function Mentions({ text, mentionable, meUsername }: LinkifyProps) {
  if (!mentionable || mentionable.size === 0 || !text.includes("@")) return <>{text}</>;
  return (
    <>
      {splitMentions(text).map((part, index) => {
        if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
        const name = part.slice(1).toLowerCase();
        if (!mentionable.has(name)) return <Fragment key={index}>{part}</Fragment>;
        return (
          <span
            key={index}
            className={`rounded px-0.5 font-semibold ${name === meUsername ? "bg-black/10 underline" : "underline decoration-dotted"}`}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}

/** Mise en forme (*gras*, _italique_, ~barré~, `code`) puis @mentions, sur un texte sans adresse web */
function Plain({ text, mentionable, meUsername }: LinkifyProps) {
  const inner = { mentionable, meUsername };
  return (
    <>
      {splitFormatting(text).map((token, index) => {
        switch (token.kind) {
          case "bold":
            return (
              <strong key={index}>
                <Plain text={token.text} {...inner} />
              </strong>
            );
          case "italic":
            return (
              <em key={index}>
                <Plain text={token.text} {...inner} />
              </em>
            );
          case "strike":
            return (
              <s key={index}>
                <Plain text={token.text} {...inner} />
              </s>
            );
          case "code":
            return (
              <code key={index} className="rounded bg-black/10 px-1 font-mono text-[0.9em]">
                {token.text}
              </code>
            );
          default:
            return <Mentions key={index} text={token.text} {...inner} />;
        }
      })}
    </>
  );
}

/** Texte d'un message : les adresses web deviennent des liens (http et https seulement), le texte est mis en forme et les @mentions sont mises en valeur */
export default function Linkify({ text, mentionable, meUsername }: LinkifyProps) {
  return (
    <>
      {text.split(URL_SPLIT).map((part, index) => {
        // Les morceaux impairs sont les adresses trouvées
        if (index % 2 === 0) {
          return (
            <Fragment key={index}>
              <Plain text={part} mentionable={mentionable} meUsername={meUsername} />
            </Fragment>
          );
        }
        const trailing = part.match(TRAILING)?.[0] ?? "";
        const href = trailing ? part.slice(0, -trailing.length) : part;
        return (
          <Fragment key={index}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="break-all underline underline-offset-2"
            >
              {href}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </>
  );
}
