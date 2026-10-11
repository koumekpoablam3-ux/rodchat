export const THEME_COOKIE = "rod_theme";
export type Theme = "auto" | "light" | "dark";

/** N'accepte que les valeurs connues : le cookie vient du navigateur */
export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "auto";
}
