"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { usePush } from "@/hooks/usePush";
import { apiRequest } from "@/lib/client-api";
import type { Theme } from "@/lib/theme";
import AccountSecuritySection from "./AccountSecuritySection";
import AppLockSection from "./AppLockSection";
import DataSaverSection from "./DataSaverSection";
import DevicesSection from "./DevicesSection";
import PaletteSection from "./PaletteSection";
import PhoneSection from "./PhoneSection";

type Settings = { theme: Theme; readReceipts: boolean; lastSeenVisible: boolean };

const THEMES: { id: Theme; label: string }[] = [
  { id: "auto", label: "Automatique" },
  { id: "light", label: "Clair" },
  { id: "dark", label: "Sombre" },
];

function applyTheme(theme: Theme) {
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-line"}`}
      >
        <span
          className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

/** Paramètres : thème, confidentialité, notifications */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const push = usePush();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ settings: Settings }>("/api/settings").then((result) => {
      if (cancelled) return;
      if (result.ok) setSettings(result.data.settings);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /** Applique tout de suite, enregistre en arrière-plan, et revient en arrière si ça échoue */
  async function change(patch: Partial<Settings>) {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, ...patch });
    if (patch.theme) applyTheme(patch.theme);
    setError("");

    const result = await apiRequest<{ settings: Settings }>("/api/settings", { method: "PATCH", json: patch });
    if (!result.ok) {
      setSettings(before);
      applyTheme(before.theme);
      setError(result.error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="rise flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="settings-title" className="font-display text-xl font-bold">
            Paramètres
          </h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg"
          >
            <X size={20} />
          </button>
        </div>

        <div className="scroll-thin space-y-5 overflow-y-auto px-5 py-3">
          {!settings && !error ? <p className="text-sm text-muted">Chargement…</p> : null}

          {settings ? (
            <>
              <fieldset>
                <legend className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-muted">
                  Apparence
                </legend>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Thème">
                  {THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      role="radio"
                      aria-checked={settings.theme === theme.id}
                      onClick={() => void change({ theme: theme.id })}
                      className={`h-11 rounded-xl border text-sm font-semibold ${
                        settings.theme === theme.id
                          ? "border-brand bg-brand text-brand-ink"
                          : "border-line hover:bg-bg"
                      }`}
                    >
                      {theme.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <section>
                <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">
                  Confidentialité
                </h3>
                <Switch
                  label="Accusés de lecture"
                  hint="Quand c'est désactivé, les autres ne voient jamais que tu as lu leurs messages."
                  checked={settings.readReceipts}
                  onChange={(value) => void change({ readReceipts: value })}
                />
                <Switch
                  label="Dernière connexion"
                  hint="Quand c'est désactivé, personne ne voit à quelle heure tu étais là pour la dernière fois."
                  checked={settings.lastSeenVisible}
                  onChange={(value) => void change({ lastSeenVisible: value })}
                />
              </section>

              <section>
                <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">
                  Notifications
                </h3>
                {push.state === "unsupported" ? (
                  <p className="text-sm text-muted">Ce navigateur ne prend pas en charge les notifications.</p>
                ) : push.state === "denied" ? (
                  <p className="text-sm text-muted">
                    Les notifications sont bloquées. Autorise-les dans les réglages de ton navigateur.
                  </p>
                ) : (
                  <Switch
                    label="Notifications sur cet appareil"
                    hint="Reçois les nouveaux messages même quand Rodchat est fermé."
                    checked={push.state === "on"}
                    onChange={(value) => void (value ? push.enable() : push.disable())}
                  />
                )}
              </section>

              <PhoneSection />

              <PaletteSection />

              <DataSaverSection />

              <DevicesSection />

              <AppLockSection />

              <AccountSecuritySection />
            </>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>

        <div className="border-t border-line p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <button type="button" onClick={onClose} className="h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink">
            Terminé
          </button>
        </div>
      </div>
    </div>
  );
}
