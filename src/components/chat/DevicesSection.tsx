"use client";

import { useCallback, useEffect, useState } from "react";
import { Laptop, Smartphone } from "lucide-react";
import { apiRequest } from "@/lib/client-api";

type Device = { id: string; label: string; createdAt: string; lastSeenAt: string; current: boolean };

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 5) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

/** Réglages « Appareils connectés » : où mon compte est ouvert, et déconnexion appareil par appareil */
export default function DevicesSection() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await apiRequest<{ sessions: Device[] }>("/api/account/sessions");
    if (result.ok) setDevices(result.data.sessions);
    else setError(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function disconnect(device: Device) {
    if (!window.confirm(`Déconnecter « ${device.label} » ?`)) return;
    setBusyId(device.id);
    setError("");
    const result = await apiRequest(`/api/account/sessions/${device.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!result.ok) setError(result.error);
    await load();
  }

  return (
    <section>
      <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Appareils connectés</h3>
      <p className="mb-2 text-sm text-muted">
        Les appareils où ton compte est ouvert. Si tu ne reconnais pas l&apos;un d&apos;eux, déconnecte-le et change ton mot de
        passe.
      </p>

      {devices === null ? (
        <p className="text-sm text-muted">{error || "Chargement…"}</p>
      ) : (
        <ul className="divide-y divide-line">
          {devices.map((device) => {
            const phone = /Android|iOS/.test(device.label);
            const Icon = phone ? Smartphone : Laptop;
            return (
              <li key={device.id} className="flex items-center gap-3 py-2.5">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bg text-muted">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {device.label}
                    {device.current ? (
                      <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand">Cet appareil</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {device.current ? "Actif en ce moment" : `Actif ${ago(device.lastSeenAt)}`} · connecté le{" "}
                    {new Date(device.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                {device.current ? null : (
                  <button
                    type="button"
                    disabled={busyId === device.id}
                    onClick={() => void disconnect(device)}
                    className="h-9 shrink-0 rounded-xl border border-line px-3 text-sm font-semibold text-danger hover:bg-bg disabled:opacity-50"
                  >
                    Déconnecter
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {devices && error ? <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p> : null}
    </section>
  );
}
