// Procedural feedback; no downloaded audio. Sound is opt-in and gesture-unlocked.
export class GameAudio {
  enabled = false;
  private context?: AudioContext;
  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.play("place");
    return this.enabled;
  }
  play(kind: "place" | "error" | "warning" | "success" | "finish"): void {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      void context.resume().catch(() => {});
      const notes = {
        place: [440, 660],
        error: [180],
        warning: [330, 330],
        success: [523, 659, 784],
        finish: [392, 330],
      }[kind];
      notes.forEach((frequency, i) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const t = context.currentTime + i * 0.12;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.055, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(t);
        oscillator.stop(t + 0.2);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    } catch {
      /* Unavailable audio must never interrupt play. */
    }
  }
}
