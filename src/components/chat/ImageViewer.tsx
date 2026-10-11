"use client";

import { useEffect, useRef } from "react";
import { Download, X } from "lucide-react";

type ImageViewerProps = { src: string; fileName: string; onClose: () => void };

export default function ImageViewer({ src, fileName, onClose }: ImageViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo : ${fileName}`}
      className="fixed inset-0 z-[80] flex flex-col bg-black/95"
      onClick={onClose}
    >
      <div className="flex items-center justify-end gap-2 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <a
          href={src}
          download={fileName}
          onClick={(event) => event.stopPropagation()}
          aria-label="Télécharger la photo"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <Download size={20} />
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <X size={22} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={fileName}
          onClick={(event) => event.stopPropagation()}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  );
}
