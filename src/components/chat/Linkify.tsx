import { Fragment } from "react";

const URL_SPLIT = /(https?:\/\/[^\s<>"'`]+)/gi;
const TRAILING = /[.,;:!?)\]}»”’]+$/;

/** Texte d'un message : les adresses web deviennent des liens (http et https seulement) */
export default function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_SPLIT).map((part, index) => {
        // Les morceaux impairs sont les adresses trouvées
        if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
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
