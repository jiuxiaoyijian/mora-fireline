import "./style.css";
import { GameAudio } from "./audio.ts";
import { performanceRecorder } from "./performance.ts";
import { GameView } from "./view.ts";
import {
  RULES,
  NAMES,
  blankLayout,
  defaultLayout,
  counts,
  canStart,
  editLayout,
  createSimulation,
  result,
  validateLayout,
  coords,
  buildable,
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
type Phase = "build" | "warning" | "running" | "paused" | "finished";
let phase: Phase = "build";
let warningRemaining = 2.4;
let pausedFrom: "warning" | "running" = "running";
let moving = -1;
let history: Layout[] = [];
let storedLayout = false;
let layout: Layout = defaultLayout();
let sim: Simulation | null = null;
let tool: Tool = "break";
let speed = 1;
let accumulator = 0;
let playbackStoppedAt: number | null = null;
let previousResult: Result | null = null;
let lastResult: Result | null = null;
let experiment = 0;
let coverage = false,
  routes = false;
let toastTimer: ReturnType<typeof setTimeout>;
// Hex topology and fixed terrain differ: preserve the old save under its old key.
const storageKey = "fireline-layout-hex-v2";
let legacyLayoutAvailable = false;
let storageAvailable = true;
try {
  const stored = localStorage.getItem(storageKey);
  legacyLayoutAvailable = !stored && !!localStorage.getItem("fireline-layout-v1");
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (validateLayout(parsed)) {
      layout = parsed;
      storedLayout = true;
    }
  }
} catch {
  storageAvailable = false;
}

function save(): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    storageAvailable = false;
  }
  el("save-status").textContent = storageAvailable
    ? "布局已自动保存 · 仅此浏览器"
    : "浏览器存储不可用 · 本次仍可正常游玩";
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
  moving = -1;
  el("cancel-move").hidden = true;
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
    house: "住宅 · 点选房屋，再点草地搬迁；空缺住宅可直接安置。",
    break: "防火带 · 1 点/格，拖动连续铺设；替换住宅后须补齐。",
    station: "喷淋 · 4 点/座，保护两步内住宅；仅预防起火。",
    erase: "拆除 · 设施返还预算，住宅退回库存；草地仍可燃。",
  };
  el("tool-note").textContent = notes[next];
  el("scene").dataset.activeTool = next;
}
let view: GameView;
try {
  view = new GameView(el("scene"), selectCell, hoverCell);
  view.setLayout(layout);
} catch (error) {
  el("scene").innerHTML =
    '<div class="webgl-error"><h2>3D 画面暂时无法启动</h2><p>请启用浏览器硬件加速，或尝试最新的 Chrome / Edge。</p></div>';
  el<HTMLButtonElement>("primary").disabled = true;
  throw error;
}
function hoverCell(i: number): void {
  const prospective = i >= 0 ? editLayout(layout, i, tool) : null;
  const valid =
    phase === "build" &&
    buildable(i) &&
    (moving >= 0
      ? layout[i] === "grass" || i === moving
      : (tool === "house" && layout[i] === "house") || !prospective?.error);
  view?.preview(
    phase === "build" ? i : -1,
    valid,
    phase === "build" && tool === "station",
    tool,
  );
  el("hover-tip").hidden = i < 0;
  if (i < 0) {
    el("hover-tip").textContent =
      phase === "build"
        ? "选择工具后，点击格子进行建造"
        : "观察火势，演练结束后可修改布局";
    return;
  }
  const { x, z } = coords(i);
  const cell = sim?.cells[i];
  const status = cell?.burned
    ? " · 已烧毁"
    : cell?.burning
      ? " · 燃烧中"
      : cell && cell.heat > 1
        ? ` · 热量 ${Math.round(cell.heat)}`
        : "";
  el("hover-tip").textContent =
    `${String.fromCharCode(65 + x)}${z + 1} · ${NAMES[layout[i]]}${status}${!buildable(i) ? " · 不可建造" : phase === "build" ? (moving >= 0 ? " · 点击空地完成搬迁" : prospective?.error ? ` · ${prospective.error}` : ` · ${tool === "station" ? "喷淋 4 点 · 预览覆盖" : tool === "break" ? "防火带 1 点" : tool === "house" ? "住宅 / 搬迁 0 点" : "拆除退还资源"}`) : ""}`;
}
function selectCell(i: number): void {
  hoverCell(i);
  if (dialogs.current && dialogs.current !== "grid-dialog") return;
  if (phase !== "build") {
    toast("演练期间不能改建。结算后选择「调整布局」。");
    return;
  }
  if (tool === "house" && layout[i] === "house") {
    moving = moving === i ? -1 : i;
    el("cancel-move").hidden = moving < 0;
    toast(
      moving < 0
        ? "已取消搬迁。"
        : "住宅已选中。点击空草地完成搬迁，Esc 取消。",
    );
    hoverCell(i);
    return;
  }
  if (moving >= 0 && layout[i] !== "grass") {
    toast("请选一块空草地放置住宅。");
    return;
  }
  const base =
    moving >= 0 ? editLayout(layout, moving, "erase").layout : layout;
  const edited = editLayout(base, i, tool);
  if (edited.error) {
    audio.play("error");
    toast(edited.error);
    return;
  }
  if (edited.layout === layout) return;
  history.push(layout.slice());
  if (history.length > 40) history.shift();
  moving = -1;
  el("cancel-move").hidden = true;
  layout = edited.layout;
  audio.play("place");
  el("insight").innerHTML =
    `<span class="insight-number">✓</span><div><strong>规划已更新。</strong><p>检查防线是否连续、喷淋是否覆盖易受热的住宅。准备好后，让方案接受山火考验。</p></div>`;
  view.setLayout(layout);
  storedLayout = true;
  save();
  syncUI();
  hoverCell(i);
}
function grid(): void {
  const focusedCell = (document.activeElement as HTMLElement | null)?.dataset
    .cell;
  el("grid").innerHTML = layout
    .map((kind, i) => {
      const { x, z } = coords(i);
      const state = sim?.cells[i];
      const label = `${String.fromCharCode(65 + x)}${z + 1} ${NAMES[kind]}${state?.burned ? " 已烧毁" : state?.burning ? " 燃烧中" : ""}`;
      return `<button data-cell="${i}" style="grid-column:${x * 2 + 1 + z % 2} / span 2;grid-row:${z + 1}" class="grid-${kind}" ${!buildable(i) || phase !== "build" ? "disabled" : ""} aria-label="${label}"><small>${String.fromCharCode(65 + x)}${z + 1}</small>${kind === "house" ? "宅" : kind === "station" ? "喷" : kind === "break" ? "隔" : kind === "source" ? "火" : kind === "stone" ? "石" : "草"}</button>`;
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
  el("homes").innerHTML = `${n.homes} <small>/ 12</small>`;
  el("budget").innerHTML = `${RULES.budget - n.spent} <small>点</small>`;
  el("homes").classList.toggle("warning", n.homes !== 12);
  el("homes-resource").classList.toggle("incomplete", n.homes !== 12);
  const labels: Record<Phase, string> = {
    build: "准备阶段",
    warning: "山火预警",
    running: "模拟中",
    paused: "已暂停",
    finished: "已结算",
  };
  el("phase-badge").textContent = labels[phase];
  el("warning-overlay").hidden = phase !== "warning";
  el("cancel-move").hidden = moving < 0 || phase !== "build";
  el<HTMLButtonElement>("undo").disabled =
    phase !== "build" || history.length === 0;
  el("skip-result").hidden =
    !sim || !(phase === "running" || phase === "paused");
  el("pause-overlay").hidden = phase !== "paused";
  el("review-result").hidden = phase !== "finished";
  el("game-stage").dataset.phase = phase;
  el("live-homes").hidden = phase === "build" || phase === "warning";
  el("goal-label").textContent = phase === "finished" && lastResult
    ? `保住 ${lastResult.saved} / 12 户 · 目标 8 户` : "目标：至少保住 8 户";
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
  primary.disabled = phase === "build" && !canStart(layout);
  if (phase === "build" && !canStart(layout))
    primary.textContent = `还需安置 ${12 - n.homes} 栋`;
  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-tool], #reset-layout, #clear-layout",
    )
    .forEach((button) => {
      button.disabled = phase !== "build";
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
  grid();
  updateTime();
}
function updateTime(): void {
  const time = (sim?.tick ?? 0) * RULES.dt;
  el("time").textContent = `${time.toFixed(1).padStart(4, "0")} / 45.0 秒`;
  el("progress").style.width = `${(time / RULES.duration) * 100}%`;
  if (sim && (phase === "running" || phase === "paused")) {
    const r = result(sim);
    el("live-homes").textContent = `尚未起火 ${r.saved} 户 · 燃烧 ${r.burning} · 烧毁 ${r.destroyed}`;
  }
}
function start(): void {
  if (!canStart(layout)) {
    toast("请先安置全部 12 栋住宅。");
    return;
  }
  dialogs.closeAll();
  moving = -1;
  sim = null;
  phase = "warning";
  playbackStoppedAt = null;
  warningRemaining = 2.4;
  el("warning-count").textContent = "3";
  audio.play("warning");
  accumulator = 0;
  experiment++;
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
    : `${(playbackStoppedAt * RULES.dt).toFixed(1)} 秒时住宅已全部烧毁，自动跳过剩余演出；结果与复盘仍按完整 45 秒计算。`;
  for (const id of ["outcome-completion", "report-completion"]) {
    el(id).textContent = completionNote;
    el(id).hidden = !completionNote;
  }
  el("report").hidden = true;
  el("report-title").textContent = r.success
    ? "防线通过了演练"
    : "这次的起火线索";
  el("report-score").innerHTML =
    `<strong>${r.saved}<small> / 12</small></strong><span>${r.success ? "达到保护目标" : `距目标还差 ${RULES.goal - r.saved} 栋`}</span>`;
  el("comparison").textContent = previousResult
    ? `同一场向东蔓延的山火：上次 ${previousResult.saved} 栋 → 本次 ${r.saved} 栋。${diff > 0 ? `多保住了 ${diff} 栋。` : diff < 0 ? `少保住了 ${-diff} 栋，试着检查新出现的缺口。` : "结果相同，可以验证另一种布局。"}`
    : "这是本次会话的第一次演练。调整后再试，比较布局的效果。";
  const ignitions = sim.events.filter(
    (event) => event.type === "ignite" && layout[event.target] === "house",
  );
  el("report-reason").textContent = ignitions.length
    ? `有 ${ignitions.length} 栋住宅被点燃。下面列出最先发生的住宅起火事件；来源为点燃当步的最大单格热输入，不代表完整因果链。${r.burning ? `结束时仍有 ${r.burning} 栋燃烧，不计入保护成功。` : ""}`
    : "本次没有住宅被点燃。可以打开传播路径检查火停在了哪里，或尝试减少防灾预算。";
  el("event-list").innerHTML = ignitions
    .slice(0, 4)
    .map((event) => {
      const a = coords(event.source),
        b = coords(event.target);
      const from = `${String.fromCharCode(65 + a.x)}${a.z + 1}`;
      const to = `${String.fromCharCode(65 + b.x)}${b.z + 1}`;
      return `<li><button data-event-cell="${event.target}" aria-pressed="false"><span>${(event.tick * RULES.dt).toFixed(1)} 秒 · 定位 ${to}</span>${from} ${NAMES[layout[event.source]]} → ${to} 住宅</button></li>`;
    })
    .join("");
  el("insight").innerHTML =
    `<span class="insight-number">${String(r.saved).padStart(2, "0")}</span><div><strong>${r.success ? "达到目标！" : "演练结束。"}保住 ${r.saved} / 12 栋住宅</strong><p>${previousResult ? `上次 ${previousResult.saved} 栋，本次 ${r.saved} 栋。` : "首次结果已记录。"}打开复盘查看线索，再调整布局。</p></div>`;
  clearTimeout(toastTimer);
  el("toast").hidden = true;
  audio.play(r.success ? "success" : "finish");
  el("outcome-heading").textContent = r.success
    ? "家园守住了。"
    : diff > 0
      ? "这一次，多留住了一些家。"
      : "风过去了，防线还可以更好。";
  el("home-lights").innerHTML = Array.from(
    { length: 12 },
    (_, i) =>
      `<span class="${i < r.saved ? "lit" : "lost"}">${svg("house")}</span>`,
  ).join("");
  el("outcome-mission").textContent = r.saved === RULES.homes
    ? "完整守护达成：12 户家园全部保住。你的防线已通过本次演练。"
    : r.success ? "最低承诺达成。还可以补强防线，让更多住户有家可归。"
    : `这份方案还需要完善：距离 8 户承诺还差 ${RULES.goal - r.saved} 户。保留布局，再修一处。`;
  el("outcome-summary").textContent =
    `保住 ${r.saved} / 12 栋 · ${r.success ? "完成保护目标" : `距离目标还差 ${RULES.goal - r.saved} 栋`} · 使用 ${counts(layout).spent} / 12 点预算${previousResult ? ` · 比上次${diff >= 0 ? "多" : "少"} ${Math.abs(diff)} 栋` : ""}`;
  const first = ignitions[0];
  const point = first ? coords(first.target) : null;
  el("outcome-tip").textContent = point
    ? `先回看 ${String.fromCharCode(65 + point.x)}${point.z + 1}：它在 ${(first.tick * RULES.dt).toFixed(1)} 秒最先起火。试着调整附近隔离或喷淋覆盖，再比较。`
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
  moving = -1;
  layout = next;
  if (clearHistory) {
    previousResult = null;
    lastResult = null;
    experiment = 0;
  }
  sim = null;
  view.setLayout(layout);
  el("report").hidden = true;
  el("insight").innerHTML =
    `<span class="insight-number">01</span><div><strong>${clearHistory ? "默认街区已恢复。" : "开始建造你的街区。"}</strong><p>${clearHistory ? "可以先建一道防线，再观察火势。" : "先安置 12 栋住宅，再布置防火设施。空地也会燃烧。"}</p></div>`;
  save();
  syncUI();
}
function showHelp(): void {
  autoPause();
  dialogs.open("help");
}
el("reset-layout").addEventListener("click", () => confirmAction(
  "恢复默认街区？", "当前布局将被替换，成绩比较会清除。布局可以撤销。",
  () => { replaceLayout(defaultLayout(), true); dialogs.closeAll(); },
));
el("clear-layout").addEventListener("click", () => confirmAction(
  "清空街区重新建造？", "住宅将退回库存，设施预算退还。你可以撤销这次操作。",
  () => { replaceLayout(blankLayout(), false); dialogs.closeAll(); },
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
    event.preventDefault();
    if (dialogs.current) {
      if (dialogs.current === "title-screen") return;
      dialogs.close();
    } else if (document.querySelector(".map-toolbar details[open]")) {
      const panel = document.querySelector<HTMLDetailsElement>(".map-toolbar details[open]")!;
      panel.open = false;
      panel.querySelector("summary")?.focus();
    } else if (moving >= 0) {
      selectTool(tool);
      toast("已取消搬迁。");
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
      sim = createSimulation(layout);
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
el("cancel-move").addEventListener("click", () => selectTool(tool));
el("scene").addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (phase === "build" && moving >= 0) {
    selectTool(tool);
    toast("已取消搬迁。");
  }
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
  el("enter-town").textContent = activeRun ? "继续本次守护 →" : phase === "finished" ? "查看本次成果 →" : storedLayout ? "继续我的规划 →" : "接受委托 →";
  el("continue-note").textContent = activeRun
    ? "火情已暂停 · 布局与进度保留在本次会话"
    : phase === "finished" ? "本次结果已保留 · 可以继续修改防线"
    : storedLayout ? "继续此浏览器保存的布局" : "先规划，再验证 · 同一场山火可反复演练";
  dialogs.open("title-screen");
}
function enterTown(): void {
  dialogs.closeAll();
  document.body.classList.remove("title-screen");
  if (legacyLayoutAvailable) {
    toast("已进入六边形新地图。旧方格布局仍保留，未覆盖；本地图独立保存。");
    legacyLayoutAvailable = false;
  }
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
el("title-new").addEventListener("click", () => confirmAction(
  "开始新的规划？", "将恢复默认街区，替换此浏览器保存的布局，并清除本次会话成绩。",
  () => {
    dialogs.closeAll();
    document.body.classList.remove("title-screen");
    phase = "build";
    history = [];
    selectTool("break");
    coverage = false;
    routes = false;
    view.coverage(false);
    view.showRoutes(false);
    el("coverage").setAttribute("aria-pressed", "false");
    el("routes").setAttribute("aria-pressed", "false");
    replaceLayout(defaultLayout(), true);
    history = [];
    speed = 1;
    syncUI();
    el("primary").focus({ preventScroll: true });
  },
));
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
selectTool(tool);
save();
syncUI();
openTitle();
requestAnimationFrame(frame);
