import PasswordRequestActions from "@/components/admin/PasswordRequestActions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPasswords() {
  const [pending, history] = await Promise.all([
    prisma.passwordResetRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        proof: true,
        createdAt: true,
        user: { select: { displayName: true, username: true, createdAt: true, lastSeenAt: true } },
      },
    }),
    prisma.passwordResetRequest.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { resolvedAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        resolvedAt: true,
        user: { select: { displayName: true, username: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Demandes de mot de passe ({pending.length})</h2>
        <p className="text-sm text-muted">
          Quand quelqu&apos;un a oublié son mot de passe, il en choisit un nouveau sur la page « Mot de passe oublié » : il ne
          s&apos;applique que si tu l&apos;approuves.
        </p>
      </div>

      <p className="rounded-2xl bg-accent/20 p-4 text-sm font-medium">
        Avant d&apos;approuver, <strong>vérifie que c&apos;est bien la bonne personne</strong> (par un autre moyen que Rodchat : un
        appel, un message, en la voyant). N&apos;importe qui peut faire une demande au nom de quelqu&apos;un d&apos;autre ; si tu
        approuves, la personne qui l&apos;a faite prend le contrôle du compte.
      </p>

      {pending.length === 0 ? (
        <p className="rounded-2xl bg-panel p-6 text-center text-muted">Aucune demande en attente.</p>
      ) : (
        <ul className="space-y-4">
          {pending.map((request) => (
            <li key={request.id} className="rounded-2xl bg-panel p-4 shadow-sm">
              <p className="font-display font-semibold">
                {request.user.displayName} <span className="text-sm font-normal text-muted">@{request.user.username}</span>
              </p>
              <p className="text-xs text-muted">
                Demande du {request.createdAt.toLocaleString("fr-FR")} · compte créé le {request.user.createdAt.toLocaleDateString("fr-FR")} ·
                dernière activité {request.user.lastSeenAt ? request.user.lastSeenAt.toLocaleString("fr-FR") : "jamais"}
              </p>
              <p className="mt-2 text-sm font-medium">Ce que la personne a écrit pour s&apos;identifier :</p>
              <blockquote className="mt-1 whitespace-pre-wrap break-words rounded-xl border-l-4 border-brand bg-bg px-3 py-2 text-sm">
                {request.proof}
              </blockquote>
              <PasswordRequestActions id={request.id} name={request.user.displayName} />
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 ? (
        <section>
          <h3 className="mb-2 font-display text-lg font-semibold">Dernières décisions</h3>
          <ul className="divide-y divide-line rounded-2xl bg-panel shadow-sm">
            {history.map((request) => (
              <li key={request.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  {request.user.displayName} <span className="text-muted">@{request.user.username}</span>
                </span>
                <span className={request.status === "APPROVED" ? "font-semibold text-brand" : "text-muted"}>
                  {request.status === "APPROVED" ? "Approuvée" : "Refusée"}
                  {request.resolvedAt ? ` · ${request.resolvedAt.toLocaleDateString("fr-FR")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
