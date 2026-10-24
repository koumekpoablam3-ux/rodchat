"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { usePush } from "@/hooks/usePush";
import { INTRO_EVENT, introSeen, markIntroSeen } from "@/lib/intro";
import { useChat } from "./ChatProvider";
import { CallScene, NotifyScene, PrivacyScene, SendScene } from "./IntroScenes";

const STEPS = [
  {
    title: "Écris sans te soucier du réseau",
    text: "Si la connexion coupe, ton message reste en attente et repart tout seul. Les coches te disent où il en est.",
    Scene: SendScene,
  },
  {
    title: "Appelle en audio ou en vidéo",
    text: "Un appel part en un toucher, depuis n'importe quelle discussion. Sur une connexion faible, coupe la caméra pour garder la voix claire.",
    Scene: CallScene,
  },
  {
    title: "Ne rate rien",
    text: "Reçois une notification pour chaque message, appel ou réaction, même application fermée. Une pastille sur l'icône te montre qu'il y a du nouveau.",
    Scene: NotifyScene,
  },
  {
    title: "Tu gardes la main",
    text: "Choisis qui voit ta dernière connexion et tes accusés de lecture, bloque ou signale en un geste, et verrouille l'application avec un code.",
    Scene: PrivacyScene,
  },
] as const;

const secondary = "rounded-full px-3 py-2 text-sm font-medium text-muted";
const primary = "h-12 rounded-full bg-brand px-6 font-semibold text-brand-ink";

/**
 * Introduction en 4 écrans, la première fois qu'un compte ouvre l'application sur un appareil (et à la demande :
 * Paramètres → Revoir l'introduction). Ignorable à tout moment ; un compte qui a déjà des discussions n'en reçoit pas.
 */
export default function IntroTour() {
  const { me, conversations } = useChat();
  const push = usePush();
  const { canInstall, iosHint, install } = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);
  const hasChats = useRef(false);
  hasChats.current = conversations.length > 0;
  const meId = me.id;

  const close = useCallback(() => {
    markIntroSeen(meId);
    setOpen(false);
  }, [meId]);

  // Première ouverture : on attend la fin de l'écran de démarrage et du verrouillage par code
  useEffect(() => {
    if (introSeen(meId)) return;
    if (hasChats.current) {
      markIntroSeen(meId); // elle connaît déjà l'application
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const splash = document.querySelector(".splash");
      const splashVisible = splash !== null && getComputedStyle(splash).display !== "none";
      const locked = document.documentElement.hasAttribute("data-locked");
      if ((!splashVisible && !locked) || tries > 25) {
        clearInterval(timer);
        setStep(0);
        setOpen(true);
      }
    }, 300);
    return () => clearInterval(timer);
  }, [meId]);

  // « Revoir l'introduction » (Paramètres)
  useEffect(() => {
    const replay = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(INTRO_EVENT, replay);
    return () => window.removeEventListener(INTRO_EVENT, replay);
  }, []);

  // Clavier : flèches pour avancer, Échap pour passer ; le focus reste dans la fenêtre
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowRight") {
        setStep((current) => Math.min(current + 1, STEPS.length - 1));
      } else if (event.key === "ArrowLeft") {
        setStep((current) => Math.max(current - 1, 0));
      } else if (event.key === "Tab" && dialog.current) {
        const items = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialog.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const canAskPush =
    push.state === "off" && typeof Notification !== "undefined" && Notification.permission === "default";

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 md:items-center md:p-6">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        tabIndex={-1}
        className="flex max-h-[100dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-panel shadow-2xl outline-none md:rounded-3xl"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (start === null) return;
          const delta = event.changedTouches[0].clientX - start;
          if (Math.abs(delta) > 50) {
            setStep((value) => (delta < 0 ? Math.min(value + 1, STEPS.length - 1) : Math.max(value - 1, 0)));
          }
        }}
      >
        {/* key : la scène se rejoue à chaque étape */}
        <div key={step}>
          <current.Scene />
        </div>

        <div className="px-6 pb-2 pt-5" aria-live="polite">
          <h2 id="intro-title" className="font-display text-[1.65rem] font-extrabold leading-tight tracking-tight">
            {current.title}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{current.text}</p>

          {step === 2 ? (
            <div className="mt-4">
              {push.state === "on" ? (
                <p className="inline-flex items-center gap-2 text-sm font-medium">
                  <Check size={18} aria-hidden="true" className="text-brand" /> Notifications activées
                </p>
              ) : canAskPush ? (
                <button type="button" onClick={() => void push.enable()} className="h-11 rounded-full border border-line px-5 text-sm font-semibold">
                  Activer les notifications
                </button>
              ) : push.state === "denied" ? (
                <p className="text-sm text-muted">
                  Les notifications sont bloquées : autorise-les dans les réglages de ton navigateur pour les recevoir.
                </p>
              ) : null}
            </div>
          ) : null}

          {isLast ? (
            <div className="mt-4">
              {canInstall ? (
                <button type="button" onClick={() => void install()} className="h-11 rounded-full border border-line px-5 text-sm font-semibold">
                  Installer l&apos;application
                </button>
              ) : iosHint ? (
                <p className="text-sm text-muted">
                  Sur iPhone : touche le bouton Partager, puis « Sur l&apos;écran d&apos;accueil ».
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
          {isLast ? (
            <button type="button" onClick={() => setStep(step - 1)} className={secondary}>
              Retour
            </button>
          ) : (
            <button type="button" onClick={close} className={secondary}>
              Passer
            </button>
          )}

          <div className="flex items-center gap-1.5" role="group" aria-label="Étapes">
            {STEPS.map((item, index) => (
              <button
                key={item.title}
                type="button"
                aria-label={`Étape ${index + 1} sur ${STEPS.length}`}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
                className={`h-2 rounded-full transition-[width,background-color] motion-reduce:transition-none ${
                  index === step ? "w-6 bg-brand" : "w-2 bg-line"
                }`}
              />
            ))}
          </div>

          <button type="button" onClick={() => (isLast ? close() : setStep(step + 1))} className={primary}>
            {isLast ? "Commencer" : "Suivant"}
          </button>
        </div>
      </div>
    </div>
  );
}
