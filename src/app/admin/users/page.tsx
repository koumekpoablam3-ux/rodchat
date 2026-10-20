import Link from "next/link";
import UserActions from "@/components/admin/UserActions";
import { formatPhone } from "@/lib/phone";
import { isAdminUsername } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function AdminUsers({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where = q
    ? {
        OR: [
          { username: { contains: q.toLowerCase() } },
          { phone: { contains: q.replace(/[\s()-]/g, "") } },
          { displayName: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        username: true,
        displayName: true,
        createdAt: true,
        lastSeenAt: true,
        suspendedAt: true,
        suspendedReason: true,
        phone: true,
        verifiedPhone: true,
        _count: { select: { messages: true } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Utilisateurs ({total})</h2>

      <form action="/admin/users" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Chercher par nom ou nom d'utilisateur"
          aria-label="Chercher un utilisateur"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-panel px-3"
        />
        <button type="submit" className="h-11 rounded-xl bg-brand px-5 font-semibold text-brand-ink">
          Chercher
        </button>
      </form>

      <ul className="space-y-3">
        {users.map((user) => {
          const admin = isAdminUsername(user.username);
          return (
            <li key={user.id} className="rounded-2xl bg-panel p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display font-semibold">{user.displayName}</p>
                <span className="text-sm text-muted">@{user.username}</span>
                {admin ? <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand">Admin</span> : null}
                {user.suspendedAt ? (
                  <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">Suspendu</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                Inscrit le {user.createdAt.toLocaleDateString("fr-FR")} · {user._count.messages} message
                {user._count.messages > 1 ? "s" : ""} · dernière activité{" "}
                {user.lastSeenAt ? user.lastSeenAt.toLocaleString("fr-FR") : "jamais"}
              </p>
              {user.phone ? (
                <p className="mt-1 text-sm">
                  Numéro : <span className="font-medium">{formatPhone(user.phone)}</span>{" "}
                  <span className={user.verifiedPhone === user.phone ? "font-semibold text-brand" : "text-muted"}>
                    {user.verifiedPhone === user.phone ? "(vérifié)" : "(non vérifié)"}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">Pas de numéro de téléphone.</p>
              )}
              {user.suspendedReason ? <p className="mt-1 text-sm text-danger">Motif : {user.suspendedReason}</p> : null}
              {admin ? null : (
                <div className="mt-3">
                  <UserActions
                    id={user.id}
                    username={user.username}
                    suspended={Boolean(user.suspendedAt)}
                    hasPhone={Boolean(user.phone)}
                    phoneVerified={user.verifiedPhone !== null && user.verifiedPhone === user.phone}
                  />
                </div>
              )}
            </li>
          );
        })}
        {users.length === 0 ? <li className="rounded-2xl bg-panel p-6 text-center text-muted">Aucun compte trouvé.</li> : null}
      </ul>

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={href(page - 1)} className="font-semibold text-brand underline">
              ← Précédent
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Page {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className="font-semibold text-brand underline">
              Suivant →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
