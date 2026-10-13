import GroupActions from "@/components/admin/GroupActions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Groupes : nom, taille, activité. Jamais le contenu des messages.
export default async function AdminGroups() {
  const groups = await prisma.conversation.findMany({
    where: { isGroup: true },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, createdAt: true, _count: { select: { participants: true, messages: true } } },
  });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Groupes ({groups.length})</h2>
      <ul className="space-y-3">
        {groups.map((group) => (
          <li key={group.id} className="rounded-2xl bg-panel p-4 shadow-sm">
            <p className="font-display font-semibold">{group.name ?? "Groupe sans nom"}</p>
            <p className="mt-1 text-sm text-muted">
              Créé le {group.createdAt.toLocaleDateString("fr-FR")} · {group._count.participants} membre
              {group._count.participants > 1 ? "s" : ""} · {group._count.messages} message
              {group._count.messages > 1 ? "s" : ""}
            </p>
            <div className="mt-3">
              <GroupActions id={group.id} name={group.name ?? "Groupe sans nom"} />
            </div>
          </li>
        ))}
        {groups.length === 0 ? <li className="rounded-2xl bg-panel p-6 text-center text-muted">Aucun groupe.</li> : null}
      </ul>
    </div>
  );
}
