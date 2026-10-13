import SettingsForm from "@/components/admin/SettingsForm";
import { getSetting, registrationPolicy } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const [policy, announcement] = await Promise.all([registrationPolicy(), getSetting("announcement")]);
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-bold">Réglages</h2>
      <SettingsForm mode={policy.mode} code={policy.code} announcement={announcement ?? ""} />
    </div>
  );
}
