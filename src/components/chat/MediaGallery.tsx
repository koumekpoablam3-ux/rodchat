"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FileText, Play, X } from "lucide-react";
import { apiRequest } from "@/lib/client-api";
import { formatBytes, formatListDate } from "@/lib/format";
import type { AttachmentInfo } from "@/types/chat";
import ImageViewer from "./ImageViewer";
import VoicePlayer from "./VoicePlayer";

type MediaType = "IMAGE" | "VIDEO" | "AUDIO" | "FILE";

type MediaItem = {
  messageId: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  attachment: AttachmentInfo;
};

type Page = { items: MediaItem[]; hasMore: boolean; lastId: string | null; loaded: boolean; loading: boolean; error: string };

const TABS: { type: MediaType; label: string }[] = [
  { type: "IMAGE", label: "Photos" },
  { type: "VIDEO", label: "Vidéos" },
  { type: "AUDIO", label: "Vocaux" },
  { type: "FILE", label: "Documents" },
];

const EMPTY: Page = { items: [], hasMore: false, lastId: null, loaded: false, loading: false, error: "" };

const EMPTY_TEXT: Record<MediaType, string> = {
  IMAGE: "Aucune photo dans cette discussion.",
  VIDEO: "Aucune vidéo dans cette discussion.",
  AUDIO: "Aucun message vocal dans cette discussion.",
  FILE: "Aucun document dans cette discussion.",
};

const src = (item: MediaItem) => `/api/attachments/${item.attachment.id}`;

type MediaGalleryProps = {
  conversationId: string;
  onClose: () => void;
  /** Aller au message dans la discussion */
  onJump: (messageId: string) => void;
};

/** Photos, vidéos, vocaux et documents échangés dans une discussion */
export default function MediaGallery({ conversationId, onClose, onJump }: MediaGalleryProps) {
  const [tab, setTab] = useState<MediaType>("IMAGE");
  const [pages, setPages] = useState<Record<MediaType, Page>>({
    IMAGE: EMPTY,
    VIDEO: EMPTY,
    AUDIO: EMPTY,
    FILE: EMPTY,
  });
  const [photo, setPhoto] = useState<MediaItem | null>(null);
  const [video, setVideo] = useState<MediaItem | null>(null);
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const load = useCallback(
    async (type: MediaType) => {
      const current = pagesRef.current[type];
      if (current.loading) return;
      setPages((prev) => ({ ...prev, [type]: { ...prev[type], loading: true, error: "" } }));

      const query = new URLSearchParams({ type });
      if (current.loaded && current.lastId) query.set("before", current.lastId);
      const result = await apiRequest<{ items: MediaItem[]; hasMore: boolean; lastId: string | null }>(
        `/api/conversations/${conversationId}/media?${query.toString()}`,
      );

      setPages((prev) => {
        const page = prev[type];
        if (!result.ok) return { ...prev, [type]: { ...page, loading: false, loaded: true, error: result.error } };
        return {
          ...prev,
          [type]: {
            items: [...page.items, ...result.data.items],
            hasMore: result.data.hasMore,
            lastId: result.data.lastId,
            loaded: true,
            loading: false,
            error: "",
          },
        };
      });
    },
    [conversationId],
  );

  // Chaque onglet se charge à sa première ouverture
  useEffect(() => {
    if (!pagesRef.current[tab].loaded) void load(tab);
  }, [tab, load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !photo && !video) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, photo, video]);

  const page = pages[tab];

  function jump(messageId: string) {
    onClose();
    onJump(messageId);
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Médias, vocaux et documents"
        className="rise flex h-full w-full flex-col bg-panel shadow-2xl md:max-w-md"
      >
        <div className="flex items-center gap-2 border-b border-line px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <button
            type="button"
            aria-label="Retour"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-display text-lg font-semibold">Médias, vocaux et documents</h2>
        </div>

        <div role="tablist" aria-label="Type de média" className="grid grid-cols-4 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.type}
              type="button"
              role="tab"
              aria-selected={tab === t.type}
              onClick={() => setTab(t.type)}
              className={`h-11 border-b-2 text-sm font-semibold ${
                tab === t.type ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="scroll-thin flex-1 overflow-y-auto" aria-live="polite">
          {page.error ? (
            <p role="alert" className="px-6 py-10 text-center text-sm text-danger">
              {page.error}
            </p>
          ) : !page.loaded ? (
            <p className="px-6 py-10 text-center text-sm text-muted">Chargement…</p>
          ) : page.items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">{EMPTY_TEXT[tab]}</p>
          ) : tab === "IMAGE" || tab === "VIDEO" ? (
            <ul className="grid grid-cols-3 gap-0.5 p-0.5">
              {page.items.map((item) => (
                <li key={item.messageId} className="relative aspect-square bg-bg">
                  <button
                    type="button"
                    onClick={() => (tab === "IMAGE" ? setPhoto(item) : setVideo(item))}
                    aria-label={`${tab === "IMAGE" ? "Photo" : "Vidéo"} de ${item.senderName}, ${formatListDate(item.createdAt)}`}
                    className="h-full w-full"
                  >
                    {tab === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src(item)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <>
                        <video src={`${src(item)}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white">
                          <Play size={28} aria-hidden="true" className="fill-current" />
                        </span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-line">
              {page.items.map((item) => (
                <li key={item.messageId} className="px-4 py-3">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-muted">
                    <span className="truncate">{item.senderName}</span>
                    <time dateTime={item.createdAt} suppressHydrationWarning>
                      {formatListDate(item.createdAt)}
                    </time>
                  </div>
                  {tab === "AUDIO" ? (
                    <VoicePlayer src={src(item)} durationMs={item.attachment.durationMs ?? 0} mine={false} />
                  ) : (
                    <div className="flex items-center gap-3">
                      <FileText size={22} aria-hidden="true" className="shrink-0 text-brand" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.attachment.fileName}</p>
                        <p className="text-xs text-muted">{formatBytes(item.attachment.size)}</p>
                      </div>
                      <a
                        href={src(item)}
                        download={item.attachment.fileName}
                        aria-label={`Télécharger ${item.attachment.fileName}`}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-bg"
                      >
                        <Download size={19} />
                      </a>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => jump(item.messageId)}
                    className="mt-1 text-xs font-semibold text-brand hover:underline"
                  >
                    Voir dans la discussion
                  </button>
                </li>
              ))}
            </ul>
          )}

          {page.loaded && page.hasMore ? (
            <div className="flex justify-center p-4">
              <button
                type="button"
                disabled={page.loading}
                onClick={() => void load(tab)}
                className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-60"
              >
                {page.loading ? "Chargement…" : "Voir plus"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {photo ? <ImageViewer src={src(photo)} fileName={photo.attachment.fileName} onClose={() => setPhoto(null)} /> : null}

      {video ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Lecture de la vidéo"
          className="fixed inset-0 z-[80] flex flex-col bg-black"
        >
          <div className="flex items-center justify-between gap-2 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <button
              type="button"
              onClick={() => jump(video.messageId)}
              className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25"
            >
              Voir dans la discussion
            </button>
            <button
              type="button"
              aria-label="Fermer la vidéo"
              onClick={() => setVideo(null)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            <video src={src(video)} controls autoPlay playsInline className="max-h-full max-w-full" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
