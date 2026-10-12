import { Fragment } from "react";
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

function Plain({ text, mentionable, meUsername }: LinkifyProps) {
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

/** Texte d'un message : les adresses web deviennent des liens (http et https seulement), les @mentions sont mises en valeur */
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
