import { Lock, MessageCircle, Smartphone } from "lucide-react";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: MessageCircle, text: "Messages, appels audio et vidéo, statuts et groupes" },
  { icon: Smartphone, text: "S'installe sur ton téléphone comme une vraie application" },
  { icon: Lock, text: "Tes contacts, tes règles : blocage, signalement, accusés réglables" },
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSessionUser()) redirect("/chat");

  return (
    <div className="grid min-h-dvh md:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <aside className="wallpaper hidden flex-col justify-between p-12 md:flex">
        <div className="auth-rise">
          <Logo size={64} />
        </div>

        <div className="space-y-10">
          {/* Conversation qui se joue toute seule */}
          <div aria-hidden="true" className="flex max-w-sm flex-col gap-2">
            <p
              className="auth-bubble auth-bubble-1 w-fit max-w-[85%] bg-bubble-in px-4 py-2.5 text-[15px] text-ink shadow-sm"
              style={{ borderRadius: 18, borderBottomLeftRadius: 5 }}
            >
              On se retrouve au Grand Marché à 18 h ?
            </p>
            <div className="relative ml-auto w-fit max-w-[85%]">
              {/* « En train d'écrire… » : tient la place de la réponse avant qu'elle n'apparaisse */}
              <span
                className="auth-typing absolute right-0 top-0 flex gap-1 bg-bubble-out px-4 py-[18px]"
                style={{ borderRadius: 18, borderBottomRightRadius: 5 }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-bubble-out-ink" />
                <span className="h-1.5 w-1.5 rounded-full bg-bubble-out-ink" />
                <span className="h-1.5 w-1.5 rounded-full bg-bubble-out-ink" />
              </span>
              <p
                className="auth-bubble auth-bubble-2 w-fit bg-bubble-out px-4 py-2.5 text-[15px] text-bubble-out-ink shadow-sm"
                style={{ borderRadius: 18, borderBottomRightRadius: 5 }}
              >
                Parfait, j&apos;arrive.
              </p>
            </div>
            <p
              className="auth-bubble auth-bubble-3 w-fit max-w-[85%] bg-bubble-in px-4 py-2.5 text-[15px] text-ink shadow-sm"
              style={{ borderRadius: 18, borderBottomLeftRadius: 5 }}
            >
              Super, je te garde une place 😉
            </p>
          </div>

          <ul className="max-w-md space-y-3">
            {FEATURES.map((feature, index) => (
              <li key={feature.text} className={`auth-rise auth-rise-${index + 2} flex items-center gap-3`}>
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel text-brand shadow-sm">
                  <feature.icon size={20} aria-hidden="true" />
                </span>
                <span className="text-[15px] font-medium">{feature.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-rise auth-rise-4 max-w-sm font-display text-2xl font-semibold leading-snug">
          Tes discussions, en privé ou en groupe, installées sur ton téléphone.
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          {/* Téléphone : pas de volet de présentation, alors le logo porte aussi la promesse en une phrase */}
          <div className="auth-rise mb-8 flex flex-col items-center gap-3 text-center md:hidden">
            <Logo size={52} />
            <p className="max-w-[17rem] text-[15px] text-muted">Tes discussions, en privé ou en groupe, sur ton téléphone.</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
