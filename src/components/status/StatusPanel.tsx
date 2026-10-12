"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { StatusAuthor, StatusFeed, StatusGroup, StatusItem } from "@/types/status";
import Avatar from "../chat/Avatar";
import { useChat } from "../chat/ChatProvider";
import StatusComposer from "./StatusComposer";
import StatusViewer, { type ViewerGroup } from "./StatusViewer";
import { statusTime } from "./time";

type PanelProps = {
  feed: StatusFeed | null;
  reload: () => Promise<void>;
  markViewed: (statusId: string) => void;
  onClose: () => void;
};

function Ring({ unseen, user }: { unseen: boolean; user: StatusAuthor }) {
  return (
    <span className={`inline-flex rounded-full p-[3px] ${unseen ? "bg-gradient-to-tr from-accent to-brand" : "bg-line"}`}>
      <span className="rounded-full bg-panel p-[2px]">
        <Avatar id={user.id} name={user.displayName} avatarUrl={user.avatarUrl} size={44} />
      </span>
    </span>
  );
}

function lastOf(items: StatusItem[]) {
  return items[items.length - 1];
}

/** Fenêtre « Statuts » : le mien, puis ceux de mes contacts (non vus d'abord) */
export default function StatusPanel({ feed, reload, markViewed, onClose }: PanelProps) {
  const { me } = useChat();
  const [composing, setComposing] = useState(false);
  // Le lecteur travaille sur une copie : si un contact publie pendant la lecture, rien ne se décale
  const [viewer, setViewer] = useState<{ groups: ViewerGroup[]; index: number } | null>(null);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !composing && !viewer) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, composing, viewer]);

  const mine = feed?.mine ?? [];
  const recent = (feed?.groups ?? []).filter((group) => group.unseen > 0);
  const seen = (feed?.groups ?? []).filter((group) => group.unseen === 0);
  const meAuthor: StatusAuthor = { id: me.id, displayName: me.displayName, avatarUrl: me.avatarUrl ?? null };

  function openMine() {
    if (mine.length === 0) return setComposing(true);
    setViewer({ groups: [{ user: meAuthor, items: mine, mine: true }], index: 0 });
  }

  function openGroup(group: StatusGroup) {
    const groups: ViewerGroup[] = [...recent, ...seen].map((g) => ({ user: g.user, items: g.items, mine: false }));
    setViewer({ groups, index: groups.findIndex((g) => g.user.id === group.user.id) });
  }

  const row = "flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-bg focus-visible:bg-bg";

  const groupRow = (group: StatusGroup) => (
    <li key={group.user.id}>
      <button type="button" className={row} onClick={() => openGroup(group)}>
        <Ring unseen={group.unseen > 0} user={group.user} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display font-semibold">{group.user.displayName}</span>
          <span className="block truncate text-sm text-muted">{statusTime(group.latestAt)}</span>
        </span>
      </button>
    </li>
  );

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
        aria-labelledby="status-title"
        className="rise flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl bg-panel shadow-2xl md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 id="status-title" className="font-display text-xl font-bold">
            Statuts
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

        <div className="scroll-thin flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {/* Mon statut */}
          <div className="flex items-center">
            <button type="button" className={`${row} flex-1`} onClick={openMine}>
              <Ring unseen={false} user={meAuthor} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display font-semibold">Mon statut</span>
                <span className="block truncate text-sm text-muted">
                  {mine.length > 0
                    ? `${mine.length} statut${mine.length > 1 ? "s" : ""} · ${statusTime(lastOf(mine).createdAt)}`
                    : "Partage un texte ou une photo pendant 24 h"}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-label="Ajouter un statut"
              onClick={() => setComposing(true)}
              className="mr-5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink"
            >
              <Plus size={20} />
            </button>
          </div>

          {feed === null ? (
            <p className="px-5 py-6 text-center text-sm text-muted">Chargement…</p>
          ) : recent.length === 0 && seen.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Aucun statut de tes contacts pour l&apos;instant. Un statut dure 24 h et n&apos;est visible que par les
              personnes avec qui tu as une discussion.
            </p>
          ) : (
            <>
              {recent.length > 0 ? (
                <section>
                  <h3 className="px-5 pb-1 pt-4 font-display text-xs font-semibold uppercase tracking-wide text-muted">
                    Récents
                  </h3>
                  <ul>{recent.map(groupRow)}</ul>
                </section>
              ) : null}
              {seen.length > 0 ? (
                <section>
                  <h3 className="px-5 pb-1 pt-4 font-display text-xs font-semibold uppercase tracking-wide text-muted">
                    Déjà vus
                  </h3>
                  <ul>{seen.map(groupRow)}</ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>

      {composing ? (
        <StatusComposer
          onClose={() => setComposing(false)}
          onPublished={() => {
            setComposing(false);
            void reload();
          }}
        />
      ) : null}

      {viewer ? (
        <StatusViewer
          groups={viewer.groups}
          startGroup={viewer.index}
          onViewed={markViewed}
          onChanged={() => void reload()}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  );
}
