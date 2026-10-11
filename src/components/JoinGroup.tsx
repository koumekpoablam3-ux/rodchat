"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@/components/chat/Avatar";
import { apiRequest } from "@/lib/client-api";

type Group = {
  id: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
  memberCount: number;
  alreadyMember: boolean;
};

/** Page ouverte depuis un lien d'invitation : montre le groupe et propose de le rejoindre */
export default function JoinGroup({ token }: { token: string }) {
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ group: Group }>(`/api/invite/${encodeURIComponent(token)}`).then((result) => {
      if (cancelled) return;
      if (result.ok) setGroup(result.data.group);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function join() {
    setBusy(true);
    setError("");
    const result = await apiRequest<{ conversationId: string }>(`/api/invite/${encodeURIComponent(token)}`, {
      method: "POST",
    });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.replace(`/chat/${result.data.conversationId}`);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-panel p-8 text-center shadow-xl">
        {group ? (
          <>
            <div className="flex justify-center">
              <Avatar id={group.id} name={group.name} avatarUrl={group.avatarUrl} isGroup size={96} />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold">{group.name}</h1>
            <p className="mt-1 text-sm text-muted">
              Groupe · {group.memberCount} participant{group.memberCount > 1 ? "s" : ""}
            </p>
            {group.description ? <p className="mt-3 whitespace-pre-wrap text-sm">{group.description}</p> : null}
            {error ? (
              <p role="alert" className="mt-4 text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => (group.alreadyMember ? router.replace(`/chat/${group.id}`) : void join())}
              className="mt-6 h-12 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
            >
              {group.alreadyMember ? "Ouvrir la discussion" : busy ? "Un instant…" : "Rejoindre le groupe"}
            </button>
          </>
        ) : error ? (
          <>
            <h1 className="font-display text-xl font-bold">Lien indisponible</h1>
            <p role="alert" className="mt-2 text-sm text-muted">
              {error}
            </p>
            <Link href="/chat" className="mt-6 inline-flex h-12 items-center rounded-xl bg-brand px-6 font-semibold text-brand-ink">
              Retour aux discussions
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted" role="status">
            Chargement…
          </p>
        )}
      </div>
    </main>
  );
}
