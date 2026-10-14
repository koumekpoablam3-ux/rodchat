"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { ChatMessage } from "@/types/chat";

type PollBlockProps = {
  message: ChatMessage;
  meId: string;
  mine: boolean;
  /** Envoie mes choix (liste vide : retirer mon vote). Renvoie un message d'erreur, ou null. */
  onVote?: (optionIds: string[]) => Promise<string | null> | void;
};

/** Sondage dans une bulle : on touche une réponse pour voter, les résultats se mettent à jour en direct */
export default function PollBlock({ message, meId, mine, onVote }: PollBlockProps) {
  const poll = message.poll;
  const [pending, setPending] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  const serverMine = poll ? poll.options.filter((o) => o.votes.some((v) => v.userId === meId)).map((o) => o.id) : [];
  // Dès que le serveur confirme (le message se met à jour), on abandonne l'affichage provisoire
  const signature = serverMine.join(",");
  useEffect(() => setPending(null), [signature]);

  if (!poll) return null;
  const chosen = pending ?? serverMine;

  // Nombre de personnes qui ont voté (une personne peut cocher plusieurs réponses)
  const voters = new Set(poll.options.flatMap((o) => o.votes.map((v) => v.userId)));
  if (pending) {
    if (pending.length > 0) voters.add(meId);
    else voters.delete(meId);
  }
  const total = Math.max(1, voters.size);

  // Nombre de votes d'une réponse, en tenant compte de mon choix provisoire
  const countOf = (option: (typeof poll.options)[number]) => {
    const others = option.votes.filter((v) => v.userId !== meId).length;
    return others + (chosen.includes(option.id) ? 1 : 0);
  };

  async function choose(optionId: string) {
    if (!onVote || message.localStatus) return;
    const next = poll!.multiple
      ? chosen.includes(optionId)
        ? chosen.filter((id) => id !== optionId)
        : [...chosen, optionId]
      : chosen.includes(optionId)
        ? []
        : [optionId];
    setPending(next);
    setError("");
    const problem = await onVote(next);
    if (problem) {
      setPending(null);
      setError(problem);
    }
  }

  const track = mine ? "bg-white/15" : "bg-black/5 dark:bg-white/10";
  const fill = mine ? "bg-white/30" : "bg-brand/25";

  return (
    <div className="w-60 py-1 sm:w-64">
      <p className="whitespace-pre-wrap break-words font-semibold">{poll.question}</p>
      <p className={`mb-2 text-xs ${mine ? "text-bubble-out-ink/70" : "text-muted"}`}>
        {poll.multiple ? "Plusieurs réponses possibles" : "Une seule réponse"}
      </p>

      <ul className="space-y-1.5" role={poll.multiple ? "group" : "radiogroup"} aria-label={poll.question}>
        {poll.options.map((option) => {
          const count = countOf(option);
          const selected = chosen.includes(option.id);
          return (
            <li key={option.id}>
              <button
                type="button"
                role={poll.multiple ? "checkbox" : "radio"}
                aria-checked={selected}
                disabled={!onVote || Boolean(message.localStatus)}
                onClick={() => void choose(option.id)}
                className={`relative block w-full overflow-hidden rounded-lg px-3 py-2 text-left text-[15px] ${track} disabled:opacity-60`}
              >
                <span className={`absolute inset-y-0 left-0 ${fill} transition-[width] duration-300`} style={{ width: `${(count / total) * 100}%` }} aria-hidden="true" />
                <span className="relative flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center border-2 ${poll.multiple ? "rounded" : "rounded-full"} ${
                      selected ? "border-current bg-current" : "border-current/50"
                    }`}
                  >
                    {selected ? <Check size={12} strokeWidth={4} className={mine ? "text-bubble-out" : "text-bubble-in"} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{option.text}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{count}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className={`mt-2 text-xs ${mine ? "text-bubble-out-ink/70" : "text-muted"}`} aria-live="polite">
        {voters.size === 0 ? "Aucun vote" : `${voters.size} personne${voters.size > 1 ? "s ont" : " a"} voté`}
      </p>
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
