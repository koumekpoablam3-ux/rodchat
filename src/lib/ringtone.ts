// Sonneries générées avec Web Audio : aucun fichier audio à stocker.
let context: AudioContext | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

function tone(frequencies: number[], durationMs: number, volume: number) {
  if (!context) return;
  const ctx = context;
  const gain = ctx.createGain();
  const start = ctx.currentTime;
  const end = start + durationMs / 1000;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.03);
  gain.gain.setValueAtTime(volume, end - 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(ctx.destination);

  for (const frequency of frequencies) {
    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

/** « incoming » : sonnerie d'un appel reçu. « outgoing » : tonalité pendant que l'autre personne est appelée. */
export function startRingtone(kind: "incoming" | "outgoing") {
  stopRingtone();
  try {
    context = context ?? new AudioContext();
    void context.resume();
  } catch {
    return;
  }

  const ring = () => {
    if (kind === "incoming") {
      tone([523, 659], 450, 0.12);
      setTimeout(() => tone([523, 659], 450, 0.12), 600);
      if ("vibrate" in navigator) navigator.vibrate([400, 200, 400]);
    } else {
      tone([425], 1000, 0.07);
    }
  };

  ring();
  interval = setInterval(ring, kind === "incoming" ? 2600 : 3500);
}

export function stopRingtone() {
  if (interval) clearInterval(interval);
  interval = null;
  if ("vibrate" in navigator) navigator.vibrate(0);
}
