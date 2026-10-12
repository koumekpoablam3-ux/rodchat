"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResolveReportButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    await fetch(`/api/admin/reports/${id}`, { method: "POST" }).catch(() => {});
    router.refresh();
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={() => void resolve()}
      disabled={busy}
      className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-60"
    >
      {busy ? "…" : "Marquer comme traité"}
    </button>
  );
}
