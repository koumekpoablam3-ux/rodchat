"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import { LogoMark } from "@/components/Logo";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { usePush } from "@/hooks/usePush";
import { shareInvite } from "@/lib/share-invite";

const ghostButton = "h-11 rounded-full border border-line bg-panel px-5 text-sm font-semibold";

// Écran affiché sur ordinateur quand aucune discussion n'est ouverte. Pour un compte tout neuf, il guide les premiers pas.
export default function ChatHome() {
  const { me, conversations, setNewChatOpen } = useChat();
  const push = usePush();
  const { canInstall, iosHint, install, installed } = useInstallPrompt();
  const [inviteNote, setInviteNote] = useState("");

  const isNew = conversations.length === 0;
  const firstName = me.displayName.trim().split(/\s+/)[0];

  const steps = [
    {
      key: "chat",
      done: !isNew,
      label: "Écris à quelqu'un",
      action: isNew ? { text: "Nouvelle discussion", run: () => setNewChatOpen(true) } : null,
    },
    // Notifications : seulement si l'appareil sait en recevoir
    ...(push.state === "unsupported"
      ? []
      : [
          {
            key: "push",
            done: push.state === "on",
            label: "Active les notifications",
            action: push.state === "off" ? { text: "Activer", run: () => void push.enable() } : null,
          },
        ]),
    // Installation : seulement si elle est possible, ou déjà faite
    ...(canInstall || installed || iosHint
      ? [
          {
            key: "install",
            done: installed,
            label: iosHint && !canInstall ? "Ajoute l'application à l'écran d'accueil (Partager, puis « Sur l'écran d'accueil »)" : "Installe l'application",
            action: canInstall ? { text: "Installer", run: () => void install() } : null,
          },
        ]
      : []),
  ];
  const remaining = steps.filter((step) => !step.done).length;

  return (
    <div className="wallpaper flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-3xl bg-panel/95 p-8 shadow-sm">
        <LogoMark size={56} />
        <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-tight">
          {isNew ? `Bienvenue, ${firstName}` : "Choisis une discussion"}
        </h2>
        <p className="mt-2 text-muted">
          {isNew
            ? "Ta liste est vide pour l'instant. Écris à quelqu'un déjà inscrit, ou invite un ami à te rejoindre."
            : "Sélectionne une conversation dans la liste, ou démarre-en une nouvelle."}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setNewChatOpen(true)} className="h-12 rounded-full bg-brand px-6 font-semibold text-brand-ink">
            Nouvelle discussion
          </button>
          <button
            type="button"
            onClick={() =>
              void shareInvite().then((result) => {
                if (result === "copied") {
                  setInviteNote("Lien copié");
                  setTimeout(() => setInviteNote(""), 2000);
                }
              })
            }
            className={`${ghostButton} inline-flex items-center gap-2`}
          >
            <Share2 size={16} aria-hidden="true" />
            {inviteNote || "Inviter des amis"}
          </button>
        </div>

        {remaining > 0 ? (
          <div className="mt-8 border-t border-line pt-5">
            <h3 className="font-display text-base font-semibold">Pour bien démarrer</h3>
            <ul className="mt-3 space-y-2.5">
              {steps.map((step) => (
                <li key={step.key} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      step.done ? "border-brand bg-brand text-brand-ink" : "border-line"
                    }`}
                  >
                    {step.done ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                  <span className={`min-w-0 flex-1 text-[15px] ${step.done ? "text-muted line-through" : ""}`}>
                    {step.label}
                    {step.done ? <span className="sr-only"> (fait)</span> : null}
                  </span>
                  {step.action ? (
                    <button type="button" onClick={step.action.run} className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm font-semibold">
                      {step.action.text}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
