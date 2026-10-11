"use client";

import { useEffect } from "react";
import { SW_ENABLED } from "@/lib/pwa";

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (!SW_ENABLED || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker non enregistré :", error);
    });
  }, []);

  return null;
}
