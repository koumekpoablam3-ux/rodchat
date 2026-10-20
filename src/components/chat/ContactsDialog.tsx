"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ContactRound, FileUp, MessageSquare, Send, ShieldAlert, X } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import { dialOf, parsePhone, PHONE_HASH_PREFIX } from "@/lib/phone";
import { parseVCard } from "@/lib/vcard";
import Avatar from "./Avatar";
import { useChat } from "./ChatProvider";

type Entry = { name: string; phone: string; hash: string };
type Match = { hash: string; user: { id: string; displayName: string; avatarUrl: string | null } };

const BATCH = 500;

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

type PickerApi = { select: (props: string[], options?: { multiple?: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };
const picker = () => (typeof navigator === "undefined" ? undefined : (navigator as Navigator & { contacts?: PickerApi }).contacts);

/**
 * Retrouver ses contacts qui sont sur Rodchat. Une application web ne peut pas lire le carnet d'adresses toute seule :
 * on le choisit dans le téléphone (là où c'est possible) ou on importe un fichier de contacts (.vcf).
 * Seules des empreintes de numéros sont envoyées ; rien n'est enregistré.
 */
export default function ContactsDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { openDirectChat } = useChat();
  const fileRef = useRef<HTMLInputElement>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [myDial, setMyDial] = useState("225");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    apiRequest<{ phone: string | null; verified: boolean }>("/api/account/phone").then((result) => {
      if (!result.ok) return setVerified(false);
      setVerified(result.data.verified);
      if (result.data.phone) setMyDial(dialOf(result.data.phone) ?? "225");
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /** Numéros bruts + noms → numéros internationaux sans doublon → empreintes → recherche sur le serveur */
  async function analyze(raw: { name: string; phones: string[] }[]) {
    setBusy(true);
    setError("");
    try {
      const byPhone = new Map<string, Entry>();
      for (const contact of raw) {
        for (const text of contact.phones) {
          const phone = parsePhone(text, myDial);
          if (phone && !byPhone.has(phone)) byPhone.set(phone, { name: contact.name, phone, hash: "" });
        }
      }
      const list = Array.from(byPhone.values());
      if (list.length === 0) {
        setEntries([]);
        setMatches([]);
        return;
      }
      for (const entry of list) entry.hash = await sha256Hex(PHONE_HASH_PREFIX + entry.phone);

      const found: Match[] = [];
      for (let i = 0; i < list.length; i += BATCH) {
        const result = await apiRequest<{ matches: Match[] }>("/api/contacts/match", {
          method: "POST",
          json: { hashes: list.slice(i, i + BATCH).map((e) => e.hash) },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        found.push(...result.data.matches);
      }
      setEntries(list);
      setMatches(found);
    } finally {
      setBusy(false);
    }
  }

  async function pickFromPhone() {
    const api = picker();
    if (!api) return;
    try {
      const chosen = await api.select(["name", "tel"], { multiple: true });
      await analyze(chosen.map((c) => ({ name: c.name?.[0] ?? "Sans nom", phones: c.tel ?? [] })));
    } catch {
      /* sélection annulée */
    }
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("Ce fichier est trop gros (5 Mo maximum).");
    const contacts = parseVCard(await file.text());
    if (contacts.length === 0) return setError("Aucun contact avec un numéro dans ce fichier. Exporte tes contacts au format vCard (.vcf).");
    await analyze(contacts);
  }

  async function write(match: Match) {
    setBusy(true);
    try {
      const id = await openDirectChat(match.user.id);
      onClose();
      router.push(`/chat/${id}`);
    } catch {
      setError("Impossible d'ouvrir la discussion.");
      setBusy(false);
    }
  }

  const matchByHash = useMemo(() => new Map(matches.map((m) => [m.hash, m])), [matches]);
  const onRodchat = (entries ?? []).filter((e) => matchByHash.has(e.hash));
  const q = filter.trim().toLowerCase();
  const others = (entries ?? []).filter((e) => !matchByHash.has(e.hash) && (!q || e.name.toLowerCase().includes(q)));

  const inviteText = `Salut ! Je suis sur Rodchat, rejoins-moi : ${typeof window === "undefined" ? "" : window.location.origin}/register`;
  const canPick = Boolean(picker());

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 md:items-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="contacts-title" className="rise flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="contacts-title" className="font-display text-xl font-bold">
            Retrouver mes contacts
          </h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg">
            <X size={20} />
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-2">
          {verified === null ? (
            <p className="text-sm text-muted">Chargement…</p>
          ) : !verified ? (
            <div className="rounded-xl bg-accent/20 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldAlert size={18} aria-hidden="true" /> Vérifie d&apos;abord ton numéro
              </p>
              <p className="mt-1">
                Pour retrouver tes contacts, ton propre numéro doit être vérifié : c&apos;est ce qui empêche quelqu&apos;un de se faire passer
                pour un autre. Ouvre <strong>Paramètres → Mon numéro</strong>.
              </p>
            </div>
          ) : entries === null ? (
            <>
              <p className="text-sm text-muted">
                Rodchat compare les numéros de tes contacts avec ceux des personnes inscrites. Seules des <strong>empreintes</strong>{" "}
                de numéros sont envoyées, et rien n&apos;est enregistré.
              </p>
              <div className="space-y-2">
                {canPick ? (
                  <button type="button" disabled={busy} onClick={() => void pickFromPhone()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60">
                    <ContactRound size={20} aria-hidden="true" /> Choisir dans mes contacts
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold disabled:opacity-60 ${canPick ? "border border-line hover:bg-bg" : "bg-brand text-brand-ink"}`}
                >
                  <FileUp size={20} aria-hidden="true" /> Importer un fichier de contacts (.vcf)
                </button>
                <input ref={fileRef} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" onChange={importFile} />
              </div>
              <p className="text-xs text-muted">
                Comment obtenir le fichier : dans l&apos;application Contacts de ton téléphone, <em>Exporter</em> ou <em>Partager</em> les
                contacts au format vCard (.vcf). Sur ordinateur, <em>contacts.google.com → Exporter → vCard</em>.
              </p>
              {busy ? <p className="text-sm text-muted">Recherche en cours…</p> : null}
            </>
          ) : (
            <>
              <section>
                <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Sur Rodchat ({onRodchat.length})</h3>
                {onRodchat.length === 0 ? (
                  <p className="text-sm text-muted">Aucun de tes contacts n&apos;est encore sur Rodchat (ou ils n&apos;ont pas vérifié leur numéro).</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {onRodchat.map((entry) => {
                      const match = matchByHash.get(entry.hash) as Match;
                      return (
                        <li key={entry.hash} className="flex items-center gap-3 py-2.5">
                          <Avatar id={match.user.id} name={match.user.displayName} avatarUrl={match.user.avatarUrl} size={42} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{entry.name}</p>
                            <p className="truncate text-sm text-muted">Sur Rodchat : {match.user.displayName}</p>
                          </div>
                          <button type="button" disabled={busy} onClick={() => void write(match)} aria-label={`Écrire à ${entry.name}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-brand-ink disabled:opacity-50">
                            <MessageSquare size={16} aria-hidden="true" /> Écrire
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">
                  À inviter ({(entries ?? []).length - onRodchat.length})
                </h3>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Chercher un contact"
                  aria-label="Chercher un contact à inviter"
                  className="mb-2 h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm"
                />
                <ul className="divide-y divide-line">
                  {others.slice(0, 100).map((entry) => (
                    <li key={entry.hash} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      <a
                        href={`sms:${entry.phone}?body=${encodeURIComponent(inviteText)}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-bg"
                      >
                        <Send size={14} aria-hidden="true" /> Inviter
                      </a>
                    </li>
                  ))}
                </ul>
                {others.length > 100 ? <p className="mt-2 text-xs text-muted">Seuls les 100 premiers sont affichés : utilise la recherche.</p> : null}
              </section>

              <button type="button" onClick={() => { setEntries(null); setMatches([]); setFilter(""); }} className="h-10 w-full rounded-xl border border-line text-sm font-semibold hover:bg-bg">
                Importer d&apos;autres contacts
              </button>
            </>
          )}

          {error ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
