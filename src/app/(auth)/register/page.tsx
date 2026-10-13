import type { Metadata } from "next";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { registrationPolicy } from "@/lib/settings";

export const metadata: Metadata = { title: "Créer un compte" };

// Lu à chaque visite : l'administrateur peut ouvrir, fermer ou protéger l'inscription à tout moment
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const policy = await registrationPolicy();
  if (policy.mode === "closed") {
    return (
      <div className="w-full space-y-4">
        <h2 className="font-display text-3xl font-bold tracking-tight">Inscriptions fermées</h2>
        <p className="text-muted">Il n&apos;est pas possible de créer un compte pour le moment. Réessaie plus tard.</p>
        <Link href="/login" className="font-semibold text-brand underline">
          Se connecter
        </Link>
      </div>
    );
  }
  return <AuthForm mode="register" inviteRequired={policy.mode === "invite"} />;
}
