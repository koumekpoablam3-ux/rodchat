// Appels à l'API depuis le navigateur, avec une réponse toujours du même format :
// soit les données, soit un message d'erreur lisible.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const NETWORK_ERROR = "Connexion impossible. Vérifie ton réseau et réessaie.";

type RequestOptions = {
  method?: string;
  /** Corps JSON */
  json?: unknown;
  /** Corps brut (photo, fichier) */
  body?: BodyInit;
  headers?: Record<string, string>;
};

export async function apiRequest<T = Record<string, unknown>>(
  url: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { ...options.headers };
  let body: BodyInit | undefined = options.body;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  let response: Response;
  try {
    response = await fetch(url, { method: options.method ?? "GET", headers, body });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    return { ok: false, error: data?.error ?? "Une erreur est survenue. Réessaie." };
  }
  return { ok: true, data: (data ?? {}) as T };
}
