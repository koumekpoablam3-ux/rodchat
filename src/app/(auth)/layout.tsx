import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSessionUser()) redirect("/chat");

  return (
    <div className="grid min-h-dvh md:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      <aside className="wallpaper hidden flex-col justify-between p-12 md:flex">
        <p className="font-display text-5xl font-extrabold tracking-tight text-brand">rodchat</p>

        {/* Aperçu décoratif d'une discussion */}
        <div aria-hidden="true" className="flex max-w-sm flex-col gap-2">
          <p
            className="w-fit max-w-[85%] bg-bubble-in px-4 py-2.5 text-[15px] text-ink"
            style={{ borderRadius: 18, borderBottomLeftRadius: 5 }}
          >
            On se retrouve au Grand Marché à 18 h ?
          </p>
          <p
            className="ml-auto w-fit max-w-[85%] bg-bubble-out px-4 py-2.5 text-[15px] text-bubble-out-ink"
            style={{ borderRadius: 18, borderBottomRightRadius: 5 }}
          >
            Parfait, j&apos;arrive.
          </p>
        </div>

        <p className="max-w-sm font-display text-2xl font-semibold leading-snug">
          Tes discussions, en privé ou en groupe, installées sur ton téléphone.
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <p className="mb-8 font-display text-4xl font-extrabold tracking-tight text-brand md:hidden">rodchat</p>
          {children}
        </div>
      </main>
    </div>
  );
}
