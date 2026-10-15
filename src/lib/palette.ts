// Couleurs de l'interface : l'aubergine d'origine, ou une autre couleur de marque.
// Elle change la couleur principale (boutons, titres, messages envoyés) en thème clair comme en thème sombre.
// Le choix est gardé dans un cookie sur l'appareil : la page s'affiche directement dans la bonne couleur.

export const PALETTE_COOKIE = "rod_palette";

export type PaletteId = "aubergine" | "ocean" | "foret" | "framboise" | "ardoise" | "terre";

/** `swatch` : la couleur montrée dans le choix (couleur de marque en thème clair) */
export const PALETTES: { id: PaletteId; label: string; swatch: string }[] = [
  { id: "aubergine", label: "Aubergine", swatch: "rgb(43 29 68)" },
  { id: "ocean", label: "Océan", swatch: "rgb(18 58 110)" },
  { id: "foret", label: "Forêt", swatch: "rgb(21 83 62)" },
  { id: "framboise", label: "Framboise", swatch: "rgb(157 23 77)" },
  { id: "ardoise", label: "Ardoise", swatch: "rgb(51 65 85)" },
  { id: "terre", label: "Terre cuite", swatch: "rgb(154 52 18)" },
];

/** N'accepte que les valeurs connues : le cookie vient du navigateur */
export function parsePalette(value: string | undefined): PaletteId {
  return PALETTES.some((p) => p.id === value) ? (value as PaletteId) : "aubergine";
}
