// ============================================================
// Synthesized notification chimes — no audio file asset, generated
// on the fly with the Web Audio API. Two short, distinct tones so a
// user can tell "new message" from "assigned to you" by ear without
// looking at the screen.
// ============================================================

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  // Browsers suspend a freshly-created (or backgrounded) context until a
  // user gesture resumes it — a no-op resume() call is harmless either way.
  void sharedContext.resume().catch(() => {});
  return sharedContext;
}

function beep(ctx: AudioContext, freq: number, startAt: number, durationSec: number, gain: number) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(gain, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startAt + durationSec);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + durationSec);
}

export type ChimeKind = "message" | "assignment";

/** Plays a short chime. Never throws — a missing/blocked AudioContext
 *  (autoplay policy before any user gesture on the page) just means
 *  silence, not a broken notification pipeline. */
export function playChime(kind: ChimeKind): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (kind === "message") {
      // Single soft note.
      beep(ctx, 880, now, 0.18, 0.05);
    } else {
      // Two-note ascending chime — a touch more attention-grabbing,
      // since being assigned a conversation means "this is now yours."
      beep(ctx, 660, now, 0.12, 0.06);
      beep(ctx, 990, now + 0.11, 0.16, 0.06);
    }
  } catch {
    // Autoplay policy / unsupported browser — fail silent.
  }
}
