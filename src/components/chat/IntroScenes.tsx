import { Check, CheckCheck, Clock, Lock, Mic, PhoneOff, Video, WifiOff } from "lucide-react";
import { LogoMark } from "@/components/Logo";

// Les quatre miniatures de l'introduction : de vrais morceaux d'interface qui se jouent seuls, pas des icônes.
// Les couleurs sont fixes (bulle ambre, texte prune) : la scène reste lisible dans tous les thèmes et palettes.

/** 1. Pas de réseau : le message attend (horloge), puis part (✓), puis arrive (✓✓) */
export function SendScene() {
  return (
    <div className="intro-scene" aria-hidden="true">
      <span className="intro-chip">
        <WifiOff size={14} /> Pas de réseau
      </span>
      <div className="flex w-full max-w-[17rem] flex-col gap-2">
        <p className="intro-bubble intro-bubble-in">Tu arrives à quelle heure ?</p>
        <p className="intro-bubble intro-bubble-out">
          <span>J&apos;arrive dans dix minutes</span>
          <span className="intro-status">
            <span className="intro-st intro-st-clock">
              <Clock size={14} />
            </span>
            <span className="intro-st intro-st-one">
              <Check size={15} />
            </span>
            <span className="intro-st intro-st-two">
              <CheckCheck size={16} />
            </span>
          </span>
        </p>
      </div>
    </div>
  );
}

/** 2. Un appel qui sonne, et la caméra qu'on coupe pour économiser la connexion */
export function CallScene() {
  return (
    <div className="intro-scene" aria-hidden="true">
      <div className="relative">
        <span className="intro-ring" />
        <span className="intro-ring intro-ring-2" />
        <div className="intro-avatar">A</div>
      </div>
      <p className="font-display text-xl font-bold leading-none">Awa</p>
      <p className="-mt-1 text-sm text-white/70">Appel en cours…</p>
      <div className="mt-1 flex items-center gap-4">
        <span className="intro-call-btn">
          <Mic size={20} />
        </span>
        <span className="intro-call-btn intro-call-btn-tap">
          <Video size={20} />
        </span>
        <span className="intro-call-btn intro-call-btn-end">
          <PhoneOff size={20} />
        </span>
      </div>
    </div>
  );
}

/** 3. Une notification arrive, la pastille s'allume sur l'icône */
export function NotifyScene() {
  return (
    <div className="intro-scene" aria-hidden="true">
      <div className="intro-notif">
        <LogoMark size={34} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Awa</p>
          <p className="truncate text-sm text-[#625e78]">On se retrouve à 18 h ? 😊</p>
        </div>
      </div>
      <div className="intro-appicon">
        <LogoMark size={40} />
        <span className="intro-badge">2</span>
      </div>
    </div>
  );
}

/** 4. Des réglages qu'on choisit soi-même : la dernière connexion se cache, le code de verrouillage s'active */
export function PrivacyScene() {
  return (
    <div className="intro-scene" aria-hidden="true">
      <div className="intro-panel">
        <div className="intro-row">
          <span>Accusés de lecture</span>
          <span className="intro-switch" data-on="true" />
        </div>
        <div className="intro-row">
          <span>Dernière connexion</span>
          <span className="intro-switch" data-on="false" data-flip="off" style={{ "--d": "0.6s" } as React.CSSProperties} />
        </div>
        <div className="intro-row">
          <span className="inline-flex items-center gap-2">
            <Lock size={15} /> Verrouillage par code
          </span>
          <span className="intro-switch" data-on="true" data-flip="on" style={{ "--d": "1.2s" } as React.CSSProperties} />
        </div>
      </div>
    </div>
  );
}
