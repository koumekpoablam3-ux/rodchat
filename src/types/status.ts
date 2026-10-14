export type StatusItem = {
  id: string;
  type: "TEXT" | "IMAGE" | "VIDEO";
  /** Texte du statut, ou légende de la photo */
  text: string | null;
  background: number;
  /** Photo ou vidéo du statut (absent pour un texte) */
  mediaUrl: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  expiresAt: string;
  /** Déjà vu par moi (toujours vrai pour mes propres statuts) */
  viewed: boolean;
  /** Mes statuts : nombre de personnes qui l'ont vu */
  viewCount?: number;
};

export type StatusAuthor = { id: string; displayName: string; avatarUrl: string | null };

export type StatusGroup = {
  user: StatusAuthor;
  items: StatusItem[];
  unseen: number;
  latestAt: string;
};

export type StatusFeed = { mine: StatusItem[]; groups: StatusGroup[] };

export type StatusViewer = { user: StatusAuthor; viewedAt: string };
