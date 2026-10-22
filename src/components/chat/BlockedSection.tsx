"use client";

import { useEffect, useState } from "react";
import Avatar from "./Avatar";

type BlockedUser = { id: string; username: string; displayName: string; avatarUrl: string | null };

/** Paramètres → personnes bloquées, avec « Débloquer » : on n'a plus besoin de retrouver la discussion pour le faire */
export default function BlockedSection() {
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/blocks")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("load"))))
      .then((data: { users: BlockedUser[] }) => {
        if (!cancelled) setUsers(data.users);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger la liste.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function unblock(user: BlockedUser) {
    setBusyId(user.id);
    setError("");
    try {
      const response = await fetch(`/api/users/${user.id}/block`, { method: "DELETE" });
      if (!response.ok) throw new Error("unblock");
      setUsers((current) => (current ? current.filter((candidate) => candidate.id !== user.id) : current));
    } catch {
      setError(`Impossible de débloquer ${user.displayName}. Réessaie.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h3 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">
        Personnes bloquées
      </h3>
      {error ? (
        <p role="alert" className="mb-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {users === null && !error ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : users && users.length === 0 ? (
        <p className="text-sm text-muted">Tu n&apos;as bloqué personne.</p>
      ) : (
        <ul className="divide-y divide-line">
          {(users ?? []).map((user) => (
            <li key={user.id} className="flex items-center gap-3 py-2">
              <Avatar id={user.id} name={user.displayName} avatarUrl={user.avatarUrl} size={36} noStatusRing />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.displayName}</p>
                <p className="truncate text-xs text-muted">@{user.username}</p>
              </div>
              <button
                type="button"
                onClick={() => void unblock(user)}
                disabled={busyId === user.id}
                className="rounded-full border border-line px-3 py-1.5 text-sm font-medium disabled:opacity-60"
              >
                {busyId === user.id ? "…" : "Débloquer"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
