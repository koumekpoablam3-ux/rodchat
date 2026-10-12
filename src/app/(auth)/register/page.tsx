import type { Metadata } from "next";
import AuthForm from "@/components/AuthForm";
import { inviteRequired } from "@/lib/invite";

export const metadata: Metadata = { title: "Créer un compte" };

// Lu à chaque visite : INVITE_CODE peut être ajouté ou retiré sans rebâtir la page
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <AuthForm mode="register" inviteRequired={inviteRequired()} />;
}
