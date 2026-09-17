import "./style.css";
import "./ui/title.css";
import "./ui/campaign.css";
import { LEVELS, newCampaign, readCampaign, migrateCampaign, awardStars } from "./sim/levels.ts";
import { GameAudio } from "./audio.ts";
import { performanceRecorder } from "./performance.ts";
import { GameView } from "./view.ts";
import {
  RULES,
  NAMES,
  counts,
  canStart,
  editLayout,
  createSimulation,
  result,
  weatherAt,
  coords,
} from "./sim/model.ts";
import type { Layout, Tool, Simulation, Result } from "./sim/model.ts";
import { advancePlayback, completeSimulation } from "./sim/playback.ts";

import { gameTemplate, svg } from "./ui/template.ts";
import { fitStage } from "./ui/stage.ts";
import { GameDialogs } from "./ui/dialogs.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = gameTemplate;
fitStage(document.getElementById("game-stage")!);
const dialogs = new GameDialogs(document.getElementById("game-stage")!);
const audio = new GameAudio();
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
el("game-stage").addEventListener("dialog-change", () => el("scene").dispatchEvent(new Event("cancel-gesture")));
type Phase = "build" | "warning" | "running" | "paused" | "finished";
let phase: Phase = "build";
let warningRemaining = 2.4;
let pausedFrom: "warning" | "running" = "running";
let campaign = newCampaign();
let level = LEVELS[0];
let history: Layout[] = [];
let storedLayout = false;
let layout: Layout = level.layout.slice();
let sim: Simulation | null = null;
let tool: Tool = "break";
let speed = 1;
let accumulator = 0;
let playbackStoppedAt: number | null = null;
let previousResult: Result | null = null;
let lastResult: Result | null = null;
let coverage = false,
  routes = false;
let toastTimer: ReturnType<typeof setTimeout>;
// Campaign saves are independent: existing sandbox layouts remain untouched.
const storageKey = "fireline-campaign-v2";
let migratedProgress = false;
let storageAvailable = true;
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) campaign = readCampaign(JSON.parse(stored));
  else {
    const legacy = localStorage.getItem("fireline-campaign-v1");
    if (legacy) { campaign = migrateCampaign(JSON.parse(legacy)); migratedProgress = true; }
  }
} catch { storageAvailable = false; }
level = LEVELS[campaign.current];
layout = campaign.layouts[level.id]?.slice() ?? level.layout.slice();
storedLayout = !!campaign.layouts[level.id];
function save(): void {
  campaign.layouts[level.id] = layout.slice();
  try { localStorage.setItem(storageKey, JSON.stringify(campaign)); }
  catch { storageAvailable = false; }
  el("save-status").textContent = storageAvailable ? "关卡与防线已保存 · 仅此浏览器" : "存储不可用 · 本次仍可游玩";
}
function toast(message: string): void {
  clearTimeout(toastTimer);
  el("toast").textContent = message;
  el("toast").hidden = false;
  toastTimer = setTimeout(() => {
    el("toast").hidden = true;
  }, 3800);
}
function selectTool(next: Tool): void {
  el("scene").dispatchEvent(new Event("cancel-gesture"));
  if (next !== "house" && !level.tools.includes(next)) { toast("本关尚未开放此工具。"); return; }
  tool = next;
  view?.preview(-1, true, false);
  document
    .querySelectorAll<HTMLButtonElement>("[data-tool]")
    .forEach((button) => {
      const active = button.dataset.tool === next;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
  const notes: Record<Tool, string> = {
    house: "查看 · 点击房屋查看材质、热量与湿润状态；房屋固定。",
    break: "防火带 · 1 点/格，拖动连接地面防线；挡不住飞火。",
    station: "喷淋 · 4 点/座，相邻一圈降温；共享 2 次拦截储备，每 4 秒补 1 次。",
    erase: "拆除 · 仅拆设施、全额返还预算；恢复的草地仍可燃。",
  };
  el("tool-note").textContent = notes[next];
  el("scene").dataset.activeTool = next;
}
let view: GameView;
try {
  view = new GameView(el("scene"), selectCell, hoverCell);
  view.setScenario(level);
  view.setLayout(layout);
} catch (error) {
  el("scene").innerHTML =
    '<div class="webgl-error"><h2>3D 画面暂时无法启动</h2><p>请启用浏览器硬件加速，或尝试最新的 Chrome / Edge。</p></div>';
  el<HTMLButtonElement>("primary").disabled = true;
  throw error;
}
function cellName(i: number): string {
  return layout[i] === "house" ? `${level.houseTypes[i] === "brick" ? "砖屋 · 阈值 90" : "木屋 · 阈值 40"}（固定）` : NAMES[layout[i]];
}
function address(i: number): string { const { x, z } = coords(i); return `${String.fromCharCode(65 + x)}${z + 1}`; }
function hoverCell(i: number): void {
  const prospective = i >= 0 ? editLayout(layout, i, tool, level) : null;
  const inspect = tool === "house" || layout[i] === "house";
  view?.preview(i, inspect || (phase === "build" && !prospective?.error), phase === "build" && tool === "station", tool === "house" ? "erase" : tool);
  el("hover-tip").hidden = i < 0;
  if (i < 0) return;
  const c = sim?.cells[i];
  const supply = sim?.supplies.find(s => s.cell === i);
  const status = supply ? ` · 拦截储备 ${supply.charges}/2${supply.charges < 2 ? ` · ${Math.max(0, (supply.refillAt - sim!.tick) * RULES.dt).toFixed(1)} 秒后补 1 次` : ""}` : c?.burned ? " · 已烧毁" : c?.burning ? " · 燃烧中" : c ? ` · 热量 ${Math.round(c.heat)}/${c.threshold}${c.wet ? " · 当前有水压" : ""}` : "";
  el("hover-tip").textContent = `${address(i)} · ${cellName(i)}${status}${phase === "build" && !inspect && prospective?.error ? ` · ${prospective.error}` : ""}`;
}
function selectCell(i: number): void {
  hoverCell(i);
  if (dialogs.current && dialogs.current !== "grid-dialog") return;
  if (tool === "house" || layout[i] === "house") {
    toast(`${address(i)} · ${cellName(i)}${layout[i] === "house" ? "。不能移动或拆除；在周围布置防护。" : ""}`);
    return;
  }
  if (phase !== "build") { toast("演练期间不能改建；结束后可保留防线调整。"); return; }
  const edited = editLayout(layout, i, tool, level);
  if (edited.error) { audio.play("error"); view.feedback(i, false); toast(edited.error); return; }
  if (edited.layout === layout) return;
  history.push(layout.slice());
  if (history.length > 40) history.shift();
  layout = edited.layout;
  audio.play("place");
  view.setLayout(layout);
  view.feedback(i, true);
  el("lesson-progress").textContent = `${address(i)} · ${tool === "erase" ? "已拆除，预算返还" : tool === "station" ? "喷淋已就位 · 青色为相邻一圈覆盖" : "防火带已铺设 · 检查两侧绕行"}`;
  storedLayout = true;
  save(); syncUI(); hoverCell(i);
}
function grid(): void {
  const focusedCell = (document.activeElement as HTMLElement | null)?.dataset
    .cell;
  el("grid").innerHTML = layout
    .map((kind, i) => {
      const { x, z } = coords(i);
      const state = sim?.cells[i];
      const label = `${String.fromCharCode(65 + x)}${z + 1} ${cellName(i)}${state?.burned ? " 已烧毁" : state?.burning ? " 燃烧中" : ""}`;
      return `<button data-cell="${i}" style="grid-column:${x * 2 + 1 + z % 2} / span 2;grid-row:${z + 1}" class="grid-${kind}" ${kind === "stone" || kind === "source" ? "disabled" : ""} aria-label="${label}"><small>${String.fromCharCode(65 + x)}${z + 1}</small>${kind === "house" ? (level.houseTypes[i] === "brick" ? "砖" : "木") : kind === "station" ? "喷" : kind === "break" ? "隔" : kind === "source" ? "火" : kind === "stone" ? "石" : "草"}</button>`;
    })
    .join("");
  if (focusedCell !== undefined)
    el("grid")
      .querySelector<HTMLButtonElement>(`[data-cell="${focusedCell}"]`)
      ?.focus({ preventScroll: true });
}
el("grid").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-cell]",
  );
  if (button) selectCell(Number(button.dataset.cell));
});
function syncUI(): void {
  if (phase !== "build") hoverCell(-1);
  const n = counts(layout);
  el("homes").innerHTML = `${n.homes} <small>户固定</small>`;
  el("budget").innerHTML = `${level.budget - n.spent} <small>点</small>`;
  el("homes").classList.toggle("warning", false);
  el("homes-resource").classList.toggle("incomplete", false);
  const labels: Record<Phase, string> = {
    build: "准备阶段",
    warning: "山火预警",
    running: "模拟中",
    paused: "已暂停",
    finished: "已结算",
  };
  el("phase-badge").textContent = labels[phase];
  el("warning-overlay").hidden = phase !== "warning";
  el<HTMLButtonElement>("undo").disabled =
    phase !== "build" || history.length === 0;
  el("skip-result").hidden =
    !sim || !(phase === "running" || phase === "paused");
  el("pause-overlay").hidden = phase !== "paused";
  el("review-result").hidden = phase !== "finished";
  el("game-stage").dataset.phase = phase;
  el("live-homes").hidden = phase === "build" || phase === "warning";
  el("goal-label").textContent = phase === "finished" && lastResult
    ? `保住 ${lastResult.saved} / ${n.homes} 户` : `第 ${level.id} 关 · ${level.name} · 守住 ${level.goal} 户`;
  if (phase === "finished") el("live-homes").textContent = "演练结束 · 可继续改进";
  const primary = el<HTMLButtonElement>("primary");
  primary.innerHTML =
    phase === "build"
      ? "开始演练 <span>→</span>"
      : phase === "running" || phase === "warning"
        ? "暂停演练 <span>Ⅱ</span>"
        : phase === "paused"
          ? "继续演练 <span>→</span>"
          : "调整布局 <span>→</span>";
  primary.disabled = phase === "build" && !canStart(layout, level);
  if (phase === "build" && !canStart(layout, level))
    primary.textContent = "防线数据异常，请重置本关";
  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-tool], #reset-layout, #clear-layout",
    )
    .forEach((button) => {
      button.disabled = (button.dataset.tool === "house" ? false : phase !== "build") || (!!button.dataset.tool && button.dataset.tool !== "house" && !level.tools.includes(button.dataset.tool as Tool));
    });
  el<HTMLButtonElement>("speed").disabled =
    phase === "finished" || phase === "warning";
  el("speed").textContent = `${speed}×`;
  el("time-label").textContent =
    phase === "build"
      ? "等待开始"
      : phase === "finished"
        ? "演练结束"
        : "火灾进程";
  el("mission-status").textContent = phase === "build"
    ? (lastResult ? `上次演练保住 ${lastResult.saved} 户。调整后再验证。` : "先规划防线，再用演练验证。")
    : phase === "finished" ? (lastResult?.success ? "本次演练已达到最低承诺。" : "根据损失线索修订方案。")
    : "正在验证防线；结果以演练结束时为准。";
  el("lesson-title").textContent = `第 ${level.id} / ${LEVELS.length} 关 · ${level.name}`;
  el("lesson-text").textContent = level.lesson;
  el("mission-heading").textContent = level.name;
  el("mission-description").textContent = level.lesson;
  el("mission-targets").textContent = `${level.goal} 户目标 · ${n.homes} 户固定住宅 · ${level.budget} 点预算 · ${level.duration} 秒 · 三星：全保且预算 ≤ ${level.efficientBudget}`;
  el("weather-plan").textContent = level.weather.map(w => `${w.at} 秒 ${w.direction === "east" ? "向东 →" : w.direction === "west" ? "← 向西" : "无风"}`).join(" / ") + (level.emberInterval ? ` · 每 ${level.emberInterval} 秒最多 ${level.emberVolley ?? 1} 枚飞火` : " · 无飞火");
  grid();
  updateTime();
}
function updateTime(): void {
  const time = (sim?.tick ?? 0) * RULES.dt;
  el("time").textContent = `${time.toFixed(1).padStart(4, "0")} / ${level.duration}.0 秒`;
  el("progress").style.width = `${(time / level.duration) * 100}%`;
  const wind = weatherAt(level, time);
  el("wind-current").textContent = `风向 ${wind.direction === "east" ? "西 → 东" : wind.direction === "west" ? "东 → 西" : "无风"}`;
  if (!sim || phase === "finished") el("water-pressure").hidden = true;
  if (!sim) el("fire-feedback").textContent = "橙线：地面受热 · 绿线：被阻断 · 屋顶蓝水滴：可拦截 · 金色：缺压";
  else if (phase === "finished") el("fire-feedback").textContent = `地面阻断 ${sim.stats.barriers} 处 · 飞火拦截 ${sim.stats.intercepted} 次 · 水压耗尽漏防 ${sim.stats.dryHits} 次`;
  if (sim && (phase === "running" || phase === "paused")) {
    const incoming = sim.embers.map(e => `${address(e.target)} · ${((e.lands - sim!.tick) * RULES.dt).toFixed(1)}秒`).join(" / ");
    el("water-pressure").textContent = sim.supplies.map(s => `${address(s.cell)} ${s.charges}/2${s.charges < 2 ? `（${Math.max(0, (s.refillAt - sim!.tick) * RULES.dt).toFixed(1)}秒）` : ""}`).join(" · ");
    el("water-pressure").hidden = !sim.supplies.length;
    el("fire-feedback").textContent = incoming ? `飞火将落在 ${incoming}` : `地面阻断 ${sim.stats.barriers} 处 · 飞火拦截 ${sim.stats.intercepted} 次 · 水压耗尽漏防 ${sim.stats.dryHits} 次`;
    const r = result(sim);
    el("live-homes").textContent = `尚未起火 ${r.saved} 户 · 燃烧 ${r.burning} · 烧毁 ${r.destroyed}`;
  }
}
function start(): void {
  el("scene").dispatchEvent(new Event("cancel-gesture"));
  if (!canStart(layout, level)) {
    toast("防线数据异常，请重置本关。");
    return;
  }
  dialogs.closeAll();
  sim = null;
  phase = "warning";
  playbackStoppedAt = null;
  warningRemaining = 2.4;
  el("warning-count").textContent = "3";
  audio.play("warning");
  accumulator = 0;
  view.setLayout(layout);
  el("report").hidden = true;
  syncUI();
}
function backToBuild(): void {
  dialogs.closeAll();
  phase = "build";
  el("report").hidden = true;
  sim = null;
  accumulator = 0;
  view.setLayout(layout);
  el("insight").innerHTML =
    `<span class="insight-number">↗</span><div><strong>保留布局，验证下一个想法。</strong><p>${lastResult ? `上次保住 ${lastResult.saved} 栋。` : ""}每次只改动一处，会更容易看清变化的原因。</p></div>`;
  syncUI();
  el("primary").focus({ preventScroll: true });
}
function primaryAction(): void {
  if (dialogs.current) return;
  if (phase === "build") start();
  else if (phase === "running" || phase === "warning") {
    pausedFrom = phase;
    phase = "paused";
    syncUI();
  } else if (phase === "paused") {
    phase = pausedFrom;
    accumulator = 0;
    syncUI();
  } else backToBuild();
}
function finish(): void {
  if (!sim) return;
  phase = "finished";
  previousResult = lastResult;
  lastResult = result(sim);
  const r = lastResult;
  const diff = previousResult ? r.saved - previousResult.saved : 0;
  const completionNote = playbackStoppedAt === null
    ? ""
    : `${(playbackStoppedAt * RULES.dt).toFixed(1)} 秒时住宅已全部烧毁，自动跳过剩余演出；结果与复盘仍按完整 ${level.duration} 秒计算。`;
  for (const id of ["outcome-completion", "report-completion"]) {
    el(id).textContent = completionNote;
    el(id).hidden = !completionNote;
  }
  el("report").hidden = true;
  el("report-title").textContent = r.success
    ? "防线通过了演练"
    : "这次的起火线索";
  el("report-score").innerHTML =
    `<strong>${r.saved}<small> / ${counts(layout).homes}</small></strong><span>${r.success ? "达到保护目标" : `距目标还差 ${level.goal - r.saved} 栋`}</span>`;
  el("comparison").textContent = previousResult
    ? `同一关卡、相同种子的山火：上次 ${previousResult.saved} 栋 → 本次 ${r.saved} 栋。${diff > 0 ? `多保住了 ${diff} 栋。` : diff < 0 ? `少保住了 ${-diff} 栋，试着检查新出现的缺口。` : "结果相同，可以验证另一种布局。"}`
    : "这是本次会话的第一次演练。调整后再试，比较布局的效果。";
  const ignitions = sim.events.filter(
    (event) => event.type === "ignite" && layout[event.target] === "house",
  );
  el("report-reason").textContent = ignitions.length
    ? `有 ${ignitions.length} 栋住宅被点燃。下面列出最先发生的住宅起火事件；地面来源为当步最大热输入；飞火来源为实际落点事件，不代表全部累计热量。${r.burning ? `结束时仍有 ${r.burning} 栋燃烧，不计入保护成功。` : ""}`
    : "本次没有住宅被点燃。可以打开传播路径检查火停在了哪里，或尝试减少防灾预算。";
  el("event-list").innerHTML = ignitions
    .slice(0, 4)
    .map((event) => {
      const a = coords(event.source),
        b = coords(event.target);
      const from = `${String.fromCharCode(65 + a.x)}${a.z + 1}`;
      const to = `${String.fromCharCode(65 + b.x)}${b.z + 1}`;
      return `<li><button data-event-cell="${event.target}" aria-pressed="false"><span>${(event.tick * RULES.dt).toFixed(1)} 秒 · 定位 ${to}</span>${event.cause === "ember" ? "飞火越过地面防线" : `${from} 地面热输入`} → ${to} 住宅</button></li>`;
    })
    .join("");
  el("insight").innerHTML =
    `<span class="insight-number">${String(r.saved).padStart(2, "0")}</span><div><strong>${r.success ? "达到目标！" : "演练结束。"}保住 ${r.saved} / ${counts(layout).homes} 栋住宅</strong><p>${previousResult ? `上次 ${previousResult.saved} 栋，本次 ${r.saved} 栋。` : "首次结果已记录。"}打开复盘查看线索，再调整布局。</p></div>`;
  clearTimeout(toastTimer);
  el("toast").hidden = true;
  audio.play(r.success ? "success" : "finish");
  el("outcome-heading").textContent = r.success
    ? "家园守住了。"
    : diff > 0
      ? "这一次，多留住了一些家。"
      : "风过去了，防线还可以更好。";
  el("home-lights").innerHTML = Array.from(
    { length: counts(layout).homes },
    (_, i) =>
      `<span class="${i < r.saved ? "lit" : "lost"}">${svg("house")}</span>`,
  ).join("");
  const stars = awardStars(r.saved, counts(layout).spent, level);
  if (r.success) {
    campaign.stars[campaign.current] = Math.max(campaign.stars[campaign.current], stars);
    campaign.unlocked = Math.max(campaign.unlocked, Math.min(LEVELS.length - 1, campaign.current + 1));
    save();
  }
  el("outcome-mission").textContent = r.success ? `${"★".repeat(stars)}${"☆".repeat(3 - stars)} · ${campaign.current === LEVELS.length - 1 ? "八次值守完成，感谢守护松风镇。" : "委托完成，下一关已解锁。"}` : `距离目标还差 ${level.goal - r.saved} 户，保留防线再修一处。`;
  const ending = r.success && campaign.current === LEVELS.length - 1;
  const completed = campaign.stars.filter(star => star > 0).length;
  el("campaign-ending").hidden = !ending;
  el("share-text").hidden = true;
  el("share-status").textContent = "";
  if (ending) {
    el("outcome-heading").textContent = completed === LEVELS.length ? "八次值守，万家灯火。" : "终章守住了。";
    el("outcome-mission").textContent = `已完成 ${completed} / 8 关 · 累计 ${campaign.stars.reduce((a,b) => a+b,0)} / 24 星 · 感谢守护松风镇。`;
    el("outcome-tip").textContent = completed === LEVELS.length ? "分享成果，或从第一关重新挑战。" : "分享终章成果，或返回关卡补齐尚未完成的委托。";
  }
  el("outcome-edit").hidden = ending;
  el("next-level").hidden = !r.success;
  el("next-level").textContent = campaign.current === LEVELS.length - 1 ? "回看八次值守 →" : "前往下一关 →";
  el("outcome-summary").textContent = `保住 ${r.saved} / ${counts(layout).homes} 户 · 预算 ${counts(layout).spent} / ${level.budget} · 地面阻断 ${sim.stats.barriers} 处 · 飞火拦截 ${sim.stats.intercepted} 次 · 水压耗尽漏防 ${sim.stats.dryHits} 次`;
  const first = ignitions[0];
  const point = first ? coords(first.target) : null;
  if (!ending) el("outcome-tip").textContent = point
    ? `先回看 ${String.fromCharCode(65 + point.x)}${point.z + 1}：它在 ${(first.tick * RULES.dt).toFixed(1)} 秒最先起火。${sim.stats.dryHits ? "喷淋储备耗尽过；先隔断正在产生飞火的草地跳板。" : "检查一格喷淋覆盖与火源方向，再调整防线。"}`
    : "所有住宅都未起火。下一次可以保留保护效果，尝试节省一点预算。";
  dialogs.open("outcome");
  syncUI();
}

document
  .querySelectorAll<HTMLButtonElement>("[data-tool]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      selectTool(button.dataset.tool as Tool),
    ),
  );
el("primary").addEventListener("click", primaryAction);
el("overlay-resume").addEventListener("click", primaryAction);
el("edit-again").addEventListener("click", backToBuild);
el("retry").addEventListener("click", start);
el("speed").addEventListener("click", () => {
  speed = speed === 1 ? 2 : 1;
  syncUI();
});
el("coverage").addEventListener("click", () => {
  coverage = !coverage;
  view.coverage(coverage);
  el("coverage").setAttribute("aria-pressed", String(coverage));
});
el("routes").addEventListener("click", () => {
  routes = !routes;
  view.showRoutes(routes);
  el("routes").setAttribute("aria-pressed", String(routes));
  if (!sim) toast("准备好了后，会显示本次实际发生的传播路径。");
});
function replaceLayout(next: Layout, clearHistory: boolean): void {
  if (phase !== "build") return;
  history.push(layout.slice());
  if (history.length > 40) history.shift();
  layout = next;
  if (clearHistory) {
    previousResult = null;
    lastResult = null;
  }
  sim = null;
  view.setLayout(layout);
  el("report").hidden = true;
  el("insight").innerHTML =
    `<span class="insight-number">01</span><div><strong>${clearHistory ? "本关防线已重置。" : "设施已清空。"}</strong><p>${clearHistory ? "可以先建一道防线，再观察火势。" : "房屋保持原位，防灾预算已返还。"}</p></div>`;
  save();
  syncUI();
}
function showHelp(): void {
  autoPause();
  dialogs.open("help");
}
el("reset-layout").addEventListener("click", () => confirmAction(
  "重置本关防线？", "当前布局将被替换，成绩比较会清除。布局可以撤销。",
  () => { replaceLayout(level.layout.slice(), true); dialogs.closeAll(); },
));
el("clear-layout").addEventListener("click", () => confirmAction(
  "清空本关设施？", "固定房屋保留，设施预算返还；此操作可以撤销。",
  () => { replaceLayout(level.layout.slice(), false); dialogs.closeAll(); },
));
el("help-open").addEventListener("click", showHelp);
el("title-help").addEventListener("click", showHelp);
el("help-close").addEventListener("click", () => dialogs.close());
// All dialog exits go through the manager so inert and focus are always restored.
el("help").querySelector("form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  dialogs.close();
});
document.addEventListener("keydown", (event) => {
  if (/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)) return;
  if (event.key === "Escape") {
    el("scene").dispatchEvent(new Event("cancel-gesture"));
    event.preventDefault();
    if (dialogs.current) {
      if (dialogs.current === "title-screen") return;
      dialogs.close();
    } else if (document.querySelector(".map-toolbar details[open]")) {
      const panel = document.querySelector<HTMLDetailsElement>(".map-toolbar details[open]")!;
      panel.open = false;
      panel.querySelector("summary")?.focus();
    } else openPause();
    return;
  }
  if (dialogs.current && dialogs.current !== "grid-dialog") return;
  if (phase === "build" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
  }
  if (event.code === "Space" && !["BUTTON", "SUMMARY"].includes((event.target as HTMLElement).tagName)) {
    event.preventDefault();
    primaryAction();
  }
  if (phase === "build" && ["1", "2", "3", "4"].includes(event.key))
    selectTool((["house", "break", "station", "erase"] as Tool[])[Number(event.key) - 1]);
});
function autoPause(): void {
  el("scene").dispatchEvent(new Event("cancel-gesture"));
  if (phase === "running" || phase === "warning") {
    pausedFrom = phase;
    phase = "paused";
    accumulator = 0;
    syncUI();
  }
}
window.addEventListener("blur", autoPause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) autoPause();
});
let lastTime = performance.now(),
  uiElapsed = 0;
function frame(now: number): void {
  if (document.hidden) { lastTime = now; requestAnimationFrame(frame); return; }
  const frameStart = performance.now();
  const interval = now - lastTime;
  const elapsed = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  if (phase === "warning") {
    warningRemaining -= elapsed;
    el("warning-count").textContent = String(
      Math.max(1, Math.ceil(warningRemaining)),
    );
    if (warningRemaining <= 0) {
      sim = createSimulation(layout, level);
      phase = "running";
      accumulator = 0;
      syncUI();
    }
  }
  if (phase === "running" && sim) {
    accumulator += elapsed * speed;
    while (accumulator >= RULES.dt && !sim.done) {
      playbackStoppedAt = advancePlayback(sim) ?? playbackStoppedAt;
      accumulator -= RULES.dt;
    }
    uiElapsed += elapsed;
    if (uiElapsed > 0.15) {
      updateTime();
      uiElapsed = 0;
    }
    if (sim.done) finish();
  }
  view.update(sim, elapsed);
  performanceRecorder.record(dialogs.current ?? phase, { interval, cpu: performance.now() - frameStart, ...view.metrics() });
  requestAnimationFrame(frame);
}
function undo(): void {
  if (phase !== "build") return;
  const prior = history.pop();
  if (!prior) return;
  layout = prior;
  selectTool(tool);
  view.setLayout(layout);
  save();
  syncUI();
  hoverCell(-1);
  audio.play("place");
  toast("已撤销上一步规划。");
}
el("undo").addEventListener("click", undo);
el("scene").addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
el("skip-result").addEventListener("click", () => {
  if (!sim || !(phase === "running" || phase === "paused")) return;
  completeSimulation(sim);
  finish();
});
function openTitle(): void {
  autoPause();
  dialogs.closeAll();
  document.body.classList.add("title-screen");
  const activeRun = phase === "paused";
  el("enter-town").textContent = activeRun ? "继续本次守护" : phase === "finished" ? "查看本次成果" : storedLayout ? "继续我的规划" : "接受委托";
  el("continue-note").textContent = activeRun
    ? "火情已暂停 · 布局与进度保留在本次会话"
    : phase === "finished" ? "本次结果已保留 · 可以继续修改防线"
    : storedLayout ? "继续此浏览器保存的布局" : "先规划，再验证 · 同一场山火可反复演练";
  if (migratedProgress) el("continue-note").textContent = "新版水压挑战 · 保留解锁，旧防线与成绩独立留存";
  dialogs.open("title-screen");
}
function enterTown(): void {
  if (migratedProgress) { toast("已保留旧版关卡解锁；范围与地图已调整，本版防线和星级重新记录。旧存档仍保留。"); migratedProgress = false; }
  dialogs.closeAll();
  document.body.classList.remove("title-screen");
  if (phase === "finished") dialogs.open("outcome");
  else el("primary").focus({ preventScroll: true });
}
function openPause(): void {
  autoPause();
  el("pause-close").textContent = phase === "paused" ? "继续演练" : "返回街区";
  el<HTMLButtonElement>("pause-restart").disabled = phase === "build";
  dialogs.open("pause-menu");
}
el("menu-open").addEventListener("click", openPause);
el("enter-town").addEventListener("click", enterTown);
el("pause-close").addEventListener("click", () => {
  dialogs.close();
  if (phase === "paused") primaryAction();
});
el("pause-title").addEventListener("click", openTitle);
let performanceQuality = false;
el("quality").addEventListener("click", () => {
  performanceQuality = !performanceQuality;
  view.setPerformanceQuality(performanceQuality);
  el("quality").textContent = performanceQuality ? "画质：流畅（关闭阴影）" : "画质：标准";
});
el("pause-restart").addEventListener("click", () => confirmAction(
  "结束本次火情，重新规划？", "保留所有建筑布局，当前火情进度不会计入成绩。", backToBuild,
));
function openLevels(): void {
  autoPause();
  el("level-list").innerHTML = LEVELS.map((stage, i) => `<button data-level="${i}" ${i > campaign.unlocked ? "disabled" : ""} class="level-choice ${i === campaign.current ? "current" : ""}"><span>${String(i + 1).padStart(2, "0")}</span><strong>${stage.name}</strong><small>${i > campaign.unlocked ? "完成前关解锁" : campaign.stars[i] ? "★".repeat(campaign.stars[i]) : "待挑战"}</small></button>`).join("");
  dialogs.open("level-select");
}
function loadLevel(i: number, savePrevious = true): void {
  if (i < 0 || i > campaign.unlocked || i >= LEVELS.length) return;
  if (savePrevious) save();
  campaign.current = i; level = LEVELS[i];
  layout = campaign.layouts[level.id]?.slice() ?? level.layout.slice();
  phase = "build"; sim = null; history = []; previousResult = null; lastResult = null; accumulator = 0; speed = 1;
  dialogs.closeAll(); document.body.classList.remove("title-screen");
  view.setScenario(level); view.setLayout(layout); selectTool(level.tools[0]);
  el("lesson-progress").textContent = "先读委托，观察火源，再布置防线。";
  el("fire-feedback").textContent = "橙线：地面受热 · 绿线：被阻断 · 屋顶蓝水滴：可拦截 · 金色：缺压";
  el("lesson-hint").hidden = i > 2;
  el("lesson-hint").textContent = level.hint;
  save(); syncUI(); el("primary").focus({ preventScroll: true });
}
el("title-new").addEventListener("click", openLevels);
el("levels-open").addEventListener("click", openLevels);
el("levels-close").addEventListener("click", () => dialogs.close());
el("level-list").addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-level]");
  if (button && !button.disabled) loadLevel(Number(button.dataset.level));
});
el("share-ending").addEventListener("click", async () => {
  const completed = campaign.stars.filter(star => star > 0).length;
  const text = `我在《火线街区》守住了松风镇！已完成 ${completed}/8 关，获得 ${campaign.stars.reduce((a,b) => a+b,0)}/24 星。来试试你的防线： https://jiuxiaoyijian.github.io/mora-fireline/`;
  const field = el<HTMLTextAreaElement>("share-text");
  field.value = text; field.hidden = false;
  try { await navigator.clipboard.writeText(text); el("share-status").textContent = "分享文字已复制，可粘贴发送给朋友。"; }
  catch { field.focus(); field.select(); el("share-status").textContent = "请选中下方文字手动复制分享。"; }
});
el("restart-campaign").addEventListener("click", () => confirmAction("重新开始八次值守？", "本版本的星级和防线将清空，从第一关重新开始。取消可保留当前成果。", () => {
  try { localStorage.setItem(`${storageKey}-backup`, JSON.stringify(campaign)); } catch { toast("无法备份进度，请稍后重试。"); return; }
  campaign = newCampaign(); migratedProgress = false;
  loadLevel(0, false);
}));
el("next-level").addEventListener("click", () => campaign.current < LEVELS.length - 1 ? loadLevel(campaign.current + 1) : openLevels());
el("hint-open").addEventListener("click", () => {
  el("lesson-hint").hidden = !el("lesson-hint").hidden;
  el("lesson-hint").textContent = level.hint;
});
el("grid-open").addEventListener("click", () => { autoPause(); dialogs.open("grid-dialog"); });
el("grid-guides").addEventListener("click", () => {
  const show = el("grid-guides").getAttribute("aria-pressed") !== "true";
  view.showGuides(show);
  el("grid-guides").setAttribute("aria-pressed", String(show));
});
for (const action of ["in", "out", "up", "down", "reset"] as const)
  el(`camera-${action}`).addEventListener("click", () => view.adjustCamera(action));
el("grid-close").addEventListener("click", () => dialogs.close());
el("report-close").addEventListener("click", () => dialogs.close());
el("review-result").addEventListener("click", () => dialogs.open("outcome"));
el("fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await app.requestFullscreen();
  } catch { toast("此环境暂不支持全屏，窗口模式仍可完整游玩。"); }
});
document.addEventListener("fullscreenchange", () => {
  el("fullscreen").setAttribute("aria-label", document.fullscreenElement ? "退出全屏" : "切换全屏");
  el("fullscreen").setAttribute("title", document.fullscreenElement ? "退出全屏" : "进入全屏");
});
let pendingAction: (() => void) | null = null;
el("game-stage").insertAdjacentHTML("beforeend", `<dialog id="confirm-action" aria-labelledby="confirm-heading"><div class="eyebrow">重新规划</div><h2 id="confirm-heading"></h2><p id="confirm-description"></p><div class="outcome-actions"><button id="confirm-cancel" class="secondary">取消</button><button id="confirm-ok" class="primary">确认</button></div></dialog>`);
function confirmAction(heading: string, description: string, action: () => void): void {
  pendingAction = action;
  el("confirm-heading").textContent = heading;
  el("confirm-ok").textContent = heading.replace(/[？?]$/, "");
  el("confirm-description").textContent = description;
  dialogs.open("confirm-action");
  el("confirm-cancel").focus();
}
el("confirm-cancel").addEventListener("click", () => { pendingAction = null; dialogs.close(); });
el("confirm-ok").addEventListener("click", () => {
  const action = pendingAction;
  pendingAction = null;
  dialogs.close();
  action?.();
});
function toggleSound(): void {
  const enabled = audio.toggle();
  for (const id of ["sound", "title-sound"]) {
    el(id).textContent = `声音：${enabled ? "开" : "关"}`;
    el(id).setAttribute("aria-pressed", String(enabled));
  }
}
el("sound").addEventListener("click", toggleSound);
el("title-sound").addEventListener("click", toggleSound);
el("outcome-edit").addEventListener("click", backToBuild);
el("outcome-details").addEventListener("click", () => {
  dialogs.closeAll();
  dialogs.open("report");
  const firstEvent = el("event-list").querySelector<HTMLButtonElement>("[data-event-cell]");
  if (firstEvent) highlightEvent(firstEvent);
});
function highlightEvent(button: HTMLButtonElement): void {
  el("event-list").querySelectorAll("button").forEach(node => node.setAttribute("aria-pressed", String(node === button)));
  view.preview(Number(button.dataset.eventCell), true, false);
}
el("event-list").addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-event-cell]");
  if (button) highlightEvent(button);
});
el("mission-open").addEventListener("click", () => { autoPause(); dialogs.open("mission-dialog"); });
el("mission-close").addEventListener("click", () => dialogs.close());
const panels = [...document.querySelectorAll<HTMLDetailsElement>(".map-toolbar details")];
for (const panel of panels) panel.addEventListener("toggle", () => {
  if (panel.open) panels.filter(other => other !== panel).forEach(other => other.open = false);
});
document.addEventListener("pointerdown", event => {
  if (!(event.target as HTMLElement).closest(".map-toolbar")) panels.forEach(panel => panel.open = false);
});
el("game-stage").addEventListener("dialog-change", () => {
  panels.forEach(panel => panel.open = false);
  if (dialogs.current !== "report") view.preview(-1, true, false);
});
selectTool(level.tools[0]);
el("lesson-hint").textContent = level.hint;
el("lesson-hint").hidden = campaign.current > 2;
save();
syncUI();
openTitle();
requestAnimationFrame(frame);

el("restore-campaign").addEventListener("click", () => {
  try {
    const backup = localStorage.getItem(`${storageKey}-backup`);
    if (!backup) { toast("还没有重开前的备份。"); return; }
    campaign = readCampaign(JSON.parse(backup));
    loadLevel(campaign.current, false);
    toast("已恢复上次重开前的成果。");
  } catch { toast("备份不可读取，当前进度保持不变。"); }
});
