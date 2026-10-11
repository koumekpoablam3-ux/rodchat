"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  Clock,
  Images,
  LogOut,
  Pin,
  PinOff,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { isMuted } from "@/lib/conversation-sort";
import {
  DISAPPEARING_OPTIONS,
  MAX_GROUP_DESCRIPTION,
  MAX_GROUP_NAME,
  disappearingLabel,
} from "@/lib/limits";
import AddMembersDialog from "./AddMembersDialog";
import Avatar from "./Avatar";
import AvatarPicker from "./AvatarPicker";
import { useChat } from "./ChatProvider";
import GroupInvite from "./GroupInvite";
import MediaGallery from "./MediaGallery";
import MuteDialog from "./MuteDialog";

type ConversationInfoProps = {
  conversationId: string;
  onClose: () => void;
  /** Ouvre la recherche dans la discussion */
  onSearch: () => void;
  /** Aller à un message de la discussion (depuis la galerie) */
  onGoToMessage: (messageId: string) => void;
};

const row =
  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] hover:bg-bg focus-visible:bg-bg disabled:opacity-60";

/** Panneau d'infos : profil du contact ou du groupe, réglages, membres */
export default function ConversationInfo({ conversationId, onClose, onSearch, onGoToMessage }: ConversationInfoProps) {
  const router = useRouter();
  const {
    me,
    conversations,
    onlineIds,
    lastSeen,
    updateConversationSettings,
    updateGroup,
    setMemberRole,
    removeMember,
    setGroupAvatar,
  } = useChat();
  const conversation = conversations.find((c) => c.id === conversationId);

  const [name, setName] = useState(conversation?.name ?? "");
  const [description, setDescription] = useState(conversation?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [disappearingOpen, setDisappearingOpen] = useState(false);
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !muteOpen && !addOpen && !galleryOpen) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, muteOpen, addOpen, galleryOpen]);

  // Le nom et la description suivent les changements faits par un autre administrateur
  const serverName = conversation?.name ?? "";
  const serverDescription = conversation?.description ?? "";
  useEffect(() => setName(serverName), [serverName]);
  useEffect(() => setDescription(serverDescription), [serverDescription]);

  if (!conversation) return null;

  const isGroup = conversation.isGroup;
  const isAdmin = conversation.myRole === "ADMIN";
  const other = isGroup ? null : (conversation.participants.find((p) => p.id === conversation.otherUserId) ?? null);
  const muted = isMuted(conversation.mutedUntil);
  const pinned = conversation.pinnedAt !== null;
  const archived = conversation.archivedAt !== null;
  const canEditGroup = isGroup && isAdmin;
  const canSetDisappearing = !isGroup || isAdmin;

  async function run(action: () => Promise<string | null>) {
    setBusy(true);
    setError("");
    const problem = await action();
    if (problem) setError(problem);
    setBusy(false);
    return problem === null;
  }

  async function saveGroupText() {
    const patch: { name?: string; description?: string | null } = {};
    if (name.trim() && name.trim() !== serverName) patch.name = name.trim();
    if (description.trim() !== serverDescription) patch.description = description.trim() || null;
    if (Object.keys(patch).length === 0) return;
    await run(() => updateGroup(conversationId, patch));
  }

  async function leave() {
    const left = await run(() => removeMember(conversationId, me.id));
    if (left) {
      onClose();
      router.push("/chat");
    }
  }

  const textChanged =
    (name.trim() !== "" && name.trim() !== serverName) || description.trim() !== serverDescription;

  const subtitle = isGroup
    ? `Groupe · ${conversation.participants.length} participant${conversation.participants.length > 1 ? "s" : ""}`
    : other
      ? `@${other.username}`
      : "";

  const members = conversation.participants
    .slice()
    .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === "ADMIN" ? -1 : 1));

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Infos de la discussion"
        className="rise scroll-thin flex h-full w-full flex-col overflow-y-auto bg-panel shadow-2xl md:max-w-md"
      >
        <div className="flex items-center gap-2 border-b border-line px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-bg"
          >
            <X size={20} />
          </button>
          <h2 className="font-display text-lg font-semibold">{isGroup ? "Infos du groupe" : "Infos du contact"}</h2>
        </div>

        <div className="space-y-4 px-5 py-5">
          {/* Photo, nom, description */}
          <div className="flex flex-col items-center gap-1 text-center">
            {canEditGroup ? (
              <AvatarPicker
                id={conversation.id}
                name={conversation.name}
                avatarUrl={conversation.avatarUrl}
                isGroup
                onPick={(photo) => setGroupAvatar(conversationId, photo)}
                onRemove={() => setGroupAvatar(conversationId, null)}
              />
            ) : (
              <Avatar
                id={conversation.otherUserId ?? conversation.id}
                name={conversation.name}
                avatarUrl={conversation.avatarUrl}
                isGroup={isGroup}
                size={112}
                online={other ? onlineIds.has(other.id) : false}
              />
            )}
            {!canEditGroup ? (
              <h3 className="mt-2 font-display text-2xl font-bold">{conversation.name}</h3>
            ) : null}
            <p className="text-sm text-muted">{subtitle}</p>
            {other ? (
              <p className="text-sm text-muted" suppressHydrationWarning>
                {onlineIds.has(other.id)
                  ? "en ligne"
                  : (lastSeen[other.id] ?? other.lastSeenAt)
                    ? `dernière connexion ${new Date((lastSeen[other.id] ?? other.lastSeenAt) as string).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`
                    : ""}
              </p>
            ) : null}
          </div>

          {canEditGroup ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Nom du groupe</span>
                <input
                  type="text"
                  value={name}
                  maxLength={MAX_GROUP_NAME}
                  onChange={(event) => setName(event.target.value)}
                  className="h-11 w-full rounded-xl border border-line bg-bg px-4"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Description</span>
                <textarea
                  value={description}
                  maxLength={MAX_GROUP_DESCRIPTION}
                  rows={3}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="À quoi sert ce groupe ?"
                  className="w-full resize-none rounded-xl border border-line bg-bg px-4 py-2.5 placeholder:text-muted"
                />
              </label>
              {textChanged ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveGroupText()}
                  className="h-11 w-full rounded-xl bg-brand font-semibold text-brand-ink disabled:opacity-60"
                >
                  Enregistrer
                </button>
              ) : null}
            </div>
          ) : isGroup && conversation.description ? (
            <p className="whitespace-pre-wrap rounded-xl bg-bg px-4 py-3 text-sm">{conversation.description}</p>
          ) : other?.about ? (
            <p className="rounded-xl bg-bg px-4 py-3 text-sm">{other.about}</p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          {/* Actions */}
          <div className="border-t border-line pt-2">
            <button
              type="button"
              className={row}
              onClick={() => {
                onClose();
                onSearch();
              }}
            >
              <Search size={20} aria-hidden="true" />
              Rechercher dans la discussion
            </button>

            <button type="button" className={row} onClick={() => setGalleryOpen(true)}>
              <Images size={20} aria-hidden="true" />
              Médias, vocaux et documents
            </button>

            {muted ? (
              <button
                type="button"
                className={row}
                disabled={busy}
                onClick={() => void run(() => updateConversationSettings(conversationId, { mutedUntil: null }))}
              >
                <Bell size={20} aria-hidden="true" />
                Réactiver le son
              </button>
            ) : (
              <button type="button" className={row} onClick={() => setMuteOpen(true)}>
                <BellOff size={20} aria-hidden="true" />
                Mettre en sourdine
              </button>
            )}

            <button
              type="button"
              className={row}
              disabled={busy}
              onClick={() => void run(() => updateConversationSettings(conversationId, { pinned: !pinned }))}
            >
              {pinned ? <PinOff size={20} aria-hidden="true" /> : <Pin size={20} aria-hidden="true" />}
              {pinned ? "Désépingler la discussion" : "Épingler la discussion"}
            </button>

            <button
              type="button"
              className={row}
              disabled={busy}
              onClick={() => void run(() => updateConversationSettings(conversationId, { archived: !archived }))}
            >
              {archived ? <ArchiveRestore size={20} aria-hidden="true" /> : <Archive size={20} aria-hidden="true" />}
              {archived ? "Désarchiver la discussion" : "Archiver la discussion"}
            </button>

            <button
              type="button"
              className={row}
              aria-expanded={disappearingOpen}
              onClick={() => setDisappearingOpen((value) => !value)}
            >
              <Clock size={20} aria-hidden="true" />
              <span className="flex-1">Messages éphémères</span>
              <span className="text-sm text-muted">{disappearingLabel(conversation.disappearingSeconds)}</span>
            </button>
            {disappearingOpen ? (
              <fieldset className="mb-2 ml-8 space-y-1 rounded-xl bg-bg p-2" disabled={!canSetDisappearing || busy}>
                <legend className="sr-only">Durée de vie des messages</legend>
                {DISAPPEARING_OPTIONS.map((option) => (
                  <label key={option.label} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2">
                    <input
                      type="radio"
                      name="disappearing"
                      checked={conversation.disappearingSeconds === option.seconds}
                      onChange={() => void run(() => updateGroup(conversationId, { disappearingSeconds: option.seconds }))}
                      className="h-4 w-4 accent-[rgb(var(--brand))]"
                    />
                    {option.label}
                  </label>
                ))}
                <p className="px-2 pb-1 pt-1 text-xs text-muted">
                  {canSetDisappearing
                    ? "Les nouveaux messages disparaissent après cette durée. Les anciens ne changent pas."
                    : "Seuls les administrateurs peuvent changer ce réglage."}
                </p>
              </fieldset>
            ) : null}
          </div>

          {/* Membres */}
          {isGroup ? (
            <div className="border-t border-line pt-3">
              <h3 className="mb-1 px-3 font-display text-sm font-semibold uppercase tracking-wide text-muted">
                {conversation.participants.length} participant{conversation.participants.length > 1 ? "s" : ""}
              </h3>

              {isAdmin ? (
                <button type="button" className={`${row} font-medium`} onClick={() => setAddOpen(true)}>
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand text-brand-ink">
                    <UserPlus size={18} aria-hidden="true" />
                  </span>
                  Ajouter des participants
                </button>
              ) : null}

              <ul>
                {members.map((member) => {
                  const itsMe = member.id === me.id;
                  const manageable = isAdmin && !itsMe;
                  const expanded = openMember === member.id;
                  return (
                    <li key={member.id}>
                      <div className="flex items-center gap-3 rounded-xl px-3 py-2">
                        <Avatar id={member.id} name={member.displayName} avatarUrl={member.avatarUrl} size={40} online={onlineIds.has(member.id)} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display font-semibold">
                            {itsMe ? "Toi" : member.displayName}
                          </p>
                          <p className="truncate text-sm text-muted">{member.about || `@${member.username}`}</p>
                        </div>
                        {member.role === "ADMIN" ? (
                          <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs font-medium text-brand">
                            Admin
                          </span>
                        ) : null}
                        {manageable ? (
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setOpenMember(expanded ? null : member.id)}
                            className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-brand hover:bg-bg"
                          >
                            Gérer
                          </button>
                        ) : null}
                      </div>
                      {expanded ? (
                        <div className="mb-1 ml-14 space-y-0.5 rounded-xl bg-bg p-1">
                          <button
                            type="button"
                            disabled={busy}
                            className={`${row} py-2 text-sm`}
                            onClick={() =>
                              void run(() =>
                                setMemberRole(conversationId, member.id, member.role === "ADMIN" ? "MEMBER" : "ADMIN"),
                              ).then(() => setOpenMember(null))
                            }
                          >
                            <ShieldCheck size={18} aria-hidden="true" />
                            {member.role === "ADMIN" ? "Retirer des administrateurs" : "Nommer administrateur"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={`${row} py-2 text-sm text-danger`}
                            onClick={() =>
                              void run(() => removeMember(conversationId, member.id)).then(() => setOpenMember(null))
                            }
                          >
                            <UserMinus size={18} aria-hidden="true" />
                            Retirer du groupe
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {canEditGroup ? <GroupInvite conversationId={conversationId} /> : null}

          {isGroup ? (
            <div className="border-t border-line pt-3">
              {confirmLeave ? (
                <div className="rounded-xl bg-danger/10 p-3">
                  <p className="text-sm font-medium">Quitter ce groupe ? Tu ne recevras plus ses messages.</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmLeave(false)}
                      className="h-11 flex-1 rounded-xl border border-line font-semibold"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void leave()}
                      className="h-11 flex-1 rounded-xl bg-danger font-semibold text-white disabled:opacity-60"
                    >
                      Quitter
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className={`${row} text-danger`} onClick={() => setConfirmLeave(true)}>
                  <LogOut size={20} aria-hidden="true" />
                  Quitter le groupe
                </button>
              )}
            </div>
          ) : null}
        </div>
      </aside>

      {muteOpen ? (
        <MuteDialog
          conversationName={conversation.name}
          onClose={() => setMuteOpen(false)}
          onConfirm={(mutedUntil) => {
            setMuteOpen(false);
            void run(() => updateConversationSettings(conversationId, { mutedUntil }));
          }}
        />
      ) : null}
      {galleryOpen ? (
        <MediaGallery
          conversationId={conversationId}
          onClose={() => setGalleryOpen(false)}
          onJump={(messageId) => {
            onClose();
            onGoToMessage(messageId);
          }}
        />
      ) : null}
      {addOpen ? (
        <AddMembersDialog
          conversationId={conversationId}
          memberIds={conversation.participants.map((p) => p.id)}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </div>
  );
}
