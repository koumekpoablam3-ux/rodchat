export const REPORT_REASONS = [
  { id: "spam", label: "Spam ou publicité non sollicitée" },
  { id: "harcelement", label: "Harcèlement ou menaces" },
  { id: "contenu", label: "Contenu inapproprié ou illégal" },
  { id: "usurpation", label: "Usurpation d'identité ou arnaque" },
  { id: "autre", label: "Autre" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id) as [ReportReason, ...ReportReason[]];
export const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
