"use client";

import { DEFAULT_QUIET_END, DEFAULT_QUIET_START, minutesToTime, timeToMinutes } from "@/lib/quiet-hours";

type QuietPatch = { quietEnabled?: boolean; quietStart?: number; quietEnd?: number; timeZone?: string };

type Props = {
  enabled: boolean;
  start: number;
  end: number;
  onChange: (patch: QuietPatch) => void;
};

const field = "h-11 rounded-xl border border-line bg-bg px-3 text-base";

/** Réglages → Notifications → Heures calmes : aucune notification (messages et appels) pendant la plage choisie */
export default function QuietHours({ enabled, start, end, onChange }: Props) {
  const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="py-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">Heures calmes</p>
          <p className="text-sm text-muted">
            Aucune notification, messages et appels compris, pendant la plage choisie. Tu retrouves tout en ouvrant
            l&apos;application.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Heures calmes"
          onClick={() =>
            // On enregistre le fuseau horaire de cet appareil pour lire l'heure locale côté serveur
            onChange({
              quietEnabled: !enabled,
              ...(enabled ? {} : { timeZone: timeZone(), quietStart: start, quietEnd: end }),
            })
          }
          className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? "bg-brand" : "bg-line"}`}
        >
          <span
            className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
              enabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {enabled ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            De
            <input
              type="time"
              value={minutesToTime(start)}
              onChange={(event) => {
                const minutes = timeToMinutes(event.target.value);
                if (minutes !== null) onChange({ quietStart: minutes, timeZone: timeZone() });
              }}
              className={field}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            à
            <input
              type="time"
              value={minutesToTime(end)}
              onChange={(event) => {
                const minutes = timeToMinutes(event.target.value);
                if (minutes !== null) onChange({ quietEnd: minutes, timeZone: timeZone() });
              }}
              className={field}
            />
          </label>
          <button
            type="button"
            onClick={() => onChange({ quietStart: DEFAULT_QUIET_START, quietEnd: DEFAULT_QUIET_END, timeZone: timeZone() })}
            className="text-sm text-muted underline"
          >
            22:00 – 07:00
          </button>
        </div>
      ) : null}
    </div>
  );
}
