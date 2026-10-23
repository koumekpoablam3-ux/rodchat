// Taille du texte de l'application (accessibilité). Tout est dimensionné en rem : agrandir la taille de base de la
// page agrandit les textes, les boutons et les espacements ensemble. Gardé dans un cookie : la page s'affiche
// directement à la bonne taille, sans clignotement.

export const TEXT_SIZE_COOKIE = "rod_textsize";

export type TextSizeId = "normal" | "large" | "xlarge";

export const TEXT_SIZES: { id: TextSizeId; label: string; sample: string }[] = [
  { id: "normal", label: "Normale", sample: "text-base" },
  { id: "large", label: "Grande", sample: "text-xl" },
  { id: "xlarge", label: "Très grande", sample: "text-2xl" },
];

/** N'accepte que les valeurs connues : le cookie vient du navigateur */
export function parseTextSize(value: string | undefined): TextSizeId {
  return TEXT_SIZES.some((size) => size.id === value) ? (value as TextSizeId) : "normal";
}
