export interface FrameSample { interval: number; cpu: number; calls: number; triangles: number; geometries: number }
export function summarize(samples: FrameSample[]) {
  const percentile = (values: number[]) => values.sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0;
  const mean = (key: keyof FrameSample) => samples.reduce((n, s) => n + s[key], 0) / Math.max(1, samples.length);
  return { samples: samples.length, fps: +(1000 / (mean("interval") || 1000)).toFixed(1),
    frameP95: +percentile(samples.map(s => s.interval)).toFixed(2), cpuP95: +percentile(samples.map(s => s.cpu)).toFixed(2),
    slowFrames: samples.filter(s => s.interval > 33.4).length,
    calls: Math.round(mean("calls")), triangles: Math.round(mean("triangles")), geometries: samples.at(-1)?.geometries ?? 0 };
}

/** Opt-in, bounded diagnostics. No browser/GPU details or results leave this page. */
class PerformanceRecorder {
  private enabled = typeof location !== "undefined" && new URLSearchParams(location.search).has("perf");
  private samples = new Map<string, FrameSample[]>();
  private edits: number[] = [];
  private output: HTMLElement | null = null;
  private lastPaint = 0;
  record(phase: string, sample: FrameSample): void {
    if (!this.enabled || document.hidden) return;
    const values = this.samples.get(phase) ?? [];
    if (values.length < 600) values.push(sample);
    this.samples.set(phase, values);
    if (performance.now() - this.lastPaint < 1000) return;
    this.lastPaint = performance.now();
    if (!this.output) {
      const panel = document.createElement("aside");
      panel.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;background:#10232eed;color:#fff;font:11px monospace;padding:8px;max-width:510px;max-height:45vh;overflow:auto;pointer-events:auto";
      const reset = document.createElement("button"); reset.textContent = "重置性能采样";
      reset.onclick = () => { this.samples.clear(); this.edits = []; };
      this.output = document.createElement("pre"); this.output.id = "performance-report";
      panel.append(reset, this.output); document.body.append(panel);
    }
    this.output.textContent = JSON.stringify({ viewport: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio,
      phases: Object.fromEntries([...this.samples].map(([name, values]) => [name, summarize(values)])),
      layoutUpdates: this.edits.length, layoutMaxMs: +Math.max(0, ...this.edits).toFixed(2),
      lastLayoutMs: this.edits.slice(-5).map(ms => +ms.toFixed(2)) }, null, 2);
  }
  layout(milliseconds: number): void { if (this.enabled && this.edits.length < 200) this.edits.push(milliseconds); }
}
export const performanceRecorder = new PerformanceRecorder();
