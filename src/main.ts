import "./style.css";
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
  step,
  result,
  validateLayout,
  coords,
  buildable,
} from "./sim/model.ts";
import type { Layout, Tool, Simulation, Result } from "./sim/model.ts";

const icons = {
  house: '<path d="m3 10 9-7 9 7M6 9v11h12V9M10 20v-7h4v7"/>',
  break: '<path d="M4 5h16M4 12h16M4 19h16M7 5v14M17 5v14"/>',
  station: '<path d="M4 20V8h16v12H4ZM9 20v-6h6v6M12 2v8M8 6h8"/>',
  erase: '<path d="m4 13 9-9 7 7-9 9H8l-4-4v-3ZM9 8l7 7M12 20h9"/>',
  fire: '<path d="M12 2c1 6 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 4-7 0 3 1 4 2 5 2-3 0-6 0-10Z"/>',
};
const svg = (name: keyof typeof icons) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./"><span class="brand-icon">${svg("fire")}</span><span>火线街区<small>FIRELINE / 城市防灾实验</small></span></a>
    <div class="header-right"><span class="version">可玩原型 v0.1</span><button id="help-open" class="quiet">玩法说明 <span>?</span></button></div>
  </header>
  <main>
    <section class="intro"><div><div class="eyebrow">01 / 东风来袭</div><h1>改变布局，改变火的走向。</h1><p>保护 12 栋住宅。观察一次，再试一次。</p></div><div class="objective"><span>本次目标</span><strong>8<span> / 12</span></strong><small>栋住宅未燃烧、未烧毁</small></div></section>
    <div class="workspace">
      <aside class="sidebar">
        <section class="panel build-panel"><div class="section-label"><h2>街区工具</h2><span id="phase-badge">准备阶段</span></div>
          <div class="resources"><div><span>已安置住宅</span><strong id="homes">12 <small>/ 12</small></strong></div><div><span>剩余防灾预算</span><strong id="budget">12 <small>点</small></strong></div></div>
          <div class="tools" role="group" aria-label="建造工具">
            <button data-tool="house" class="tool" aria-pressed="false">${svg("house")}<span><b>住宅</b><small>固定 12 栋 · 可搬迁</small></span><kbd>1</kbd></button>
            <button data-tool="break" class="tool selected" aria-pressed="true">${svg("break")}<span><b>防火带</b><small>隔断传播 · 1 点 / 格</small></span><kbd>2</kbd></button>
            <button data-tool="station" class="tool" aria-pressed="false">${svg("station")}<span><b>消防站</b><small>附近降温 · 4 点 / 座</small></span><kbd>3</kbd></button>
            <button data-tool="erase" class="tool" aria-pressed="false">${svg("erase")}<span><b>拆除 / 搬迁</b><small>退还预算或住宅</small></span><kbd>4</kbd></button>
          </div>
          <p class="tool-note" id="tool-note">点击草地或住宅铺设防火带。住宅被替换后，需要在其他位置补齐。</p>
          <div class="small-actions"><button id="reset-layout">默认街区</button><button id="clear-layout">清空重建</button></div>
        </section>
        <section class="panel forecast"><div class="eyebrow">灾害预报 / 固定条件</div><div class="wind"><span>西</span><span class="wind-arrow">⟶</span><strong>东风</strong></div><p>西侧两处起火，沿干草带蔓延。<br>空地也会燃烧，连续隔离才有效。</p><div class="forecast-foot"><span>模拟时长 <b>45 秒</b></span><span>目标 <b>≥ 8 栋</b></span></div></section>
        <div class="save-status" id="save-status">布局自动保存在此浏览器</div>
      </aside>
      <section class="game-panel" aria-label="灾害实验">
        <div class="map-toolbar"><span class="live-label"><i id="state-dot"></i><b id="map-status">准备实验</b></span><div class="map-toggles"><button id="coverage" aria-pressed="false">消防覆盖</button><button id="routes" aria-pressed="false">传播路径</button></div></div>
        <div class="map-wrap"><div id="scene"></div><div class="map-caption"><span>街区 01</span><small>8 × 8 / 西侧为火线</small></div><div class="hover-tip" id="hover-tip">选择工具后，点击格子进行建造</div><div id="pause-overlay" class="pause-overlay" hidden><span>实验已暂停</span><small>布局与火势已保留</small><button id="overlay-resume" class="primary">继续实验</button></div></div>
        <div class="control-bar"><div class="time-block"><span id="time-label">等待开始</span><div class="progress-track"><div id="progress"></div></div><small id="time">00.0 / 45.0 秒</small></div><div class="control-buttons"><button id="speed" class="speed" aria-label="切换模拟速度">1×</button><button id="primary" class="primary">启动火灾 <span>→</span></button></div></div>
        <div class="insight" id="insight"><span class="insight-number">01</span><div><strong>先观察，再改变。</strong><p>可以直接启动默认街区，看看火势如何穿过住宅。下一次，试着截断它的路线。</p></div></div>
      </section>
    </div>
    <section class="report panel" id="report" hidden aria-label="实验报告"><div class="report-head"><div><div class="eyebrow">AFTER THE FIRE / 实验复盘</div><h2 id="report-title"></h2><p id="comparison"></p></div><div class="report-score" id="report-score"></div></div><div class="report-body"><div><h3>这次发生了什么</h3><p id="report-reason"></p><ol id="event-list"></ol></div><div class="report-next"><h3>下一次实验</h3><p>返回建造，调整一处布局，再用相同火情验证你的判断。</p><div><button id="edit-again" class="primary">调整布局 →</button><button id="retry" class="secondary">原样重试</button></div></div></div></section>
    <details class="accessible-map"><summary>键盘建造网格与地图状态</summary><p>与 3D 地图同步。选好工具后，用 Tab 选择格子并按 Enter 建造。</p><div id="grid" class="a11y-grid" role="group" aria-label="街区建造网格"></div></details>
    <footer><span>FIRELINE · 每次重建，都是一个新假设。</span><span>固定灾害 · 可重复实验 · 规则模拟</span></footer>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="help"><form method="dialog"><button class="dialog-close" aria-label="关闭玩法说明">×</button></form><div class="eyebrow">FIELD GUIDE / 玩法说明</div><h2>把一场损失，变成下一次的经验。</h2><ol class="help-steps"><li><b>先看一次。</b>点击「启动火灾」。东风会推动西侧火势穿过草地和住宅。</li><li><b>找出原因。</b>实验后查看实际传播记录，也可以打开地图上的传播路径。</li><li><b>改变布局。</b>防火带不燃烧；消防站在两格步行距离内共享降温能力。已燃烧的住宅无法被救回。</li><li><b>再次验证。</b>保住至少 8 栋住宅即达标。同样布局与火情，结果完全相同。</li></ol><p class="help-tip">开始前需放满 12 栋住宅；防灾预算为 12 点。快捷键 1–4 切换工具，空格开始 / 暂停。失焦自动暂停。当前以桌面操作为主。</p><button id="help-close" class="primary">回到街区 →</button></dialog>
`;

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
type Phase = "build" | "running" | "paused" | "finished";
let phase: Phase = "build";
let layout: Layout = defaultLayout();
let sim: Simulation | null = null;
let tool: Tool = "break";
let speed = 1;
let accumulator = 0;
let previousResult: Result | null = null;
let lastResult: Result | null = null;
let experiment = 0;
let coverage = false,
  routes = false;
let toastTimer: ReturnType<typeof setTimeout>;
const storageKey = "fireline-layout-v1";
let storageAvailable = true;
try {
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (validateLayout(parsed)) layout = parsed;
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
  tool = next;
  document
    .querySelectorAll<HTMLButtonElement>("[data-tool]")
    .forEach((button) => {
      const active = button.dataset.tool === next;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
  const notes: Record<Tool, string> = {
    house: "点击格子安置住宅。搬迁时先拆除旧住宅，再放到新位置。",
    break: "点击草地或住宅铺设防火带。住宅被替换后，需要在其他位置补齐。",
    station: "保护两格步行距离内的目标。受热目标越多，每格分到的降温能力越少。",
    erase: "点击设施退还预算。拆除住宅会退回库存；留下的草地仍然可燃。",
  };
  el("tool-note").textContent = notes[next];
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
  if (i < 0) {
    el("hover-tip").textContent =
      phase === "build"
        ? "选择工具后，点击格子进行建造"
        : "观察火势，实验结束后可修改布局";
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
    `${String.fromCharCode(65 + x)}${z + 1} · ${NAMES[layout[i]]}${status}${!buildable(i) ? " · 不可建造" : ""}`;
}
function selectCell(i: number): void {
  hoverCell(i);
  if (phase !== "build") {
    toast("实验期间不能改建。结算后选择「调整布局」。");
    return;
  }
  const edited = editLayout(layout, i, tool);
  if (edited.error) {
    toast(edited.error);
    return;
  }
  if (edited.layout === layout) return;
  layout = edited.layout;
  view.setLayout(layout);
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
      return `<button data-cell="${i}" class="grid-${kind}" ${!buildable(i) || phase !== "build" ? "disabled" : ""} aria-label="${label}"><small>${String.fromCharCode(65 + x)}${z + 1}</small>${kind === "house" ? "宅" : kind === "station" ? "消" : kind === "break" ? "隔" : kind === "source" ? "火" : kind === "stone" ? "石" : "草"}</button>`;
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
  const n = counts(layout);
  el("homes").innerHTML = `${n.homes} <small>/ 12</small>`;
  el("budget").innerHTML = `${RULES.budget - n.spent} <small>点</small>`;
  el("homes").classList.toggle("warning", n.homes !== 12);
  const labels: Record<Phase, string> = {
    build: "准备阶段",
    running: "模拟中",
    paused: "已暂停",
    finished: "已结算",
  };
  el("phase-badge").textContent = labels[phase];
  el("map-status").textContent =
    phase === "build"
      ? "准备实验"
      : `实验 ${String(experiment).padStart(2, "0")} · ${labels[phase]}`;
  el("state-dot").classList.toggle("running", phase === "running");
  el("pause-overlay").hidden = phase !== "paused";
  const primary = el<HTMLButtonElement>("primary");
  primary.innerHTML =
    phase === "build"
      ? "启动火灾 <span>→</span>"
      : phase === "running"
        ? "暂停实验 <span>Ⅱ</span>"
        : phase === "paused"
          ? "继续实验 <span>→</span>"
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
  el<HTMLButtonElement>("speed").disabled = phase === "finished";
  el("speed").textContent = `${speed}×`;
  el("time-label").textContent =
    phase === "build"
      ? "等待开始"
      : phase === "finished"
        ? "实验结束"
        : "火灾进程";
  grid();
  updateTime();
}
function updateTime(): void {
  const time = (sim?.tick ?? 0) * RULES.dt;
  el("time").textContent = `${time.toFixed(1).padStart(4, "0")} / 45.0 秒`;
  el("progress").style.width = `${(time / RULES.duration) * 100}%`;
  if (sim && (phase === "running" || phase === "paused")) {
    const r = result(sim);
    el("insight").innerHTML =
      `<span class="insight-number">${String(r.saved).padStart(2, "0")}</span><div><strong>栋住宅尚未燃烧 · ${r.burning} 栋燃烧中 · ${r.destroyed} 栋已烧毁</strong><p>火焰不能穿过防火带，但会从缺口绕行。打开「消防覆盖」观察保护范围。</p></div>`;
  }
}
function start(): void {
  if (!canStart(layout)) {
    toast("请先安置全部 12 栋住宅。");
    return;
  }
  sim = createSimulation(layout);
  phase = "running";
  accumulator = 0;
  experiment++;
  view.setLayout(layout);
  el("report").hidden = true;
  syncUI();
}
function backToBuild(): void {
  phase = "build";
  sim = null;
  accumulator = 0;
  view.setLayout(layout);
  el("insight").innerHTML =
    `<span class="insight-number">↗</span><div><strong>保留布局，验证下一个想法。</strong><p>${lastResult ? `上次保住 ${lastResult.saved} 栋。` : ""}每次只改动一处，会更容易看清变化的原因。</p></div>`;
  syncUI();
  el("primary").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function primaryAction(): void {
  if (phase === "build") start();
  else if (phase === "running") {
    phase = "paused";
    syncUI();
  } else if (phase === "paused") {
    phase = "running";
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
  el("report").hidden = false;
  el("report-title").textContent = r.success
    ? "街区守住了。"
    : "火留下了下一次的线索。";
  el("report-score").innerHTML =
    `<strong>${r.saved}<small> / 12</small></strong><span>${r.success ? "达到保护目标" : `距目标还差 ${RULES.goal - r.saved} 栋`}</span>`;
  el("comparison").textContent = previousResult
    ? `同一场东风火灾：上次 ${previousResult.saved} 栋 → 本次 ${r.saved} 栋。${diff > 0 ? `多保住了 ${diff} 栋。` : diff < 0 ? `少保住了 ${-diff} 栋，试着检查新出现的缺口。` : "结果相同，可以验证另一种布局。"}`
    : "这是本次会话的第一次实验。调整后再试，比较布局的效果。";
  const ignitions = sim.events.filter(
    (event) => event.type === "ignite" && layout[event.target] === "house",
  );
  el("report-reason").textContent = ignitions.length
    ? `有 ${ignitions.length} 栋住宅被点燃。下面列出最先发生的住宅起火事件；每条来源都取自本次模拟。${r.burning ? `结束时仍有 ${r.burning} 栋燃烧，不计入保护成功。` : ""}`
    : "本次没有住宅被点燃。可以打开传播路径检查火停在了哪里，或尝试减少防灾预算。";
  el("event-list").innerHTML = ignitions
    .slice(0, 4)
    .map((event) => {
      const a = coords(event.source),
        b = coords(event.target);
      const from = `${String.fromCharCode(65 + a.x)}${a.z + 1}`;
      const to = `${String.fromCharCode(65 + b.x)}${b.z + 1}`;
      return `<li><span>${(event.tick * RULES.dt).toFixed(1)}s</span> ${from} ${NAMES[layout[event.source]]} → ${to} 住宅</li>`;
    })
    .join("");
  el("insight").innerHTML =
    `<span class="insight-number">${String(r.saved).padStart(2, "0")}</span><div><strong>${r.success ? "达到目标！" : "实验结束。"}保住 ${r.saved} / 12 栋住宅</strong><p>${previousResult ? `上次 ${previousResult.saved} 栋，本次 ${r.saved} 栋。` : "首次结果已记录。"}向下查看实验复盘，再调整布局。</p></div>`;
  toast(
    `实验结束：保住 ${r.saved} / 12 栋住宅。${r.success ? "达到目标！" : "调整布局，再试一次。"}`,
  );
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
  if (!sim) toast("启动火灾后，会显示本次实际发生的传播路径。");
});
function replaceLayout(next: Layout, clearHistory: boolean): void {
  if (phase !== "build") return;
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
    `<span class="insight-number">01</span><div><strong>${clearHistory ? "默认街区已恢复。" : "开始建造你的街区。"}</strong><p>${clearHistory ? "可以直接启动一次，观察火势。" : "先安置 12 栋住宅，再布置防火设施。空地也会燃烧。"}</p></div>`;
  save();
  syncUI();
}
el("reset-layout").addEventListener("click", () =>
  replaceLayout(defaultLayout(), true),
);
el("clear-layout").addEventListener("click", () =>
  replaceLayout(blankLayout(), false),
);
const help = el<HTMLDialogElement>("help");
el("help-open").addEventListener("click", () => {
  if (phase === "running") {
    phase = "paused";
    syncUI();
  }
  help.showModal();
});
el("help-close").addEventListener("click", () => help.close());
document.addEventListener("keydown", (event) => {
  if (
    help.open ||
    /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)
  )
    return;
  if (
    event.code === "Space" &&
    !["BUTTON", "SUMMARY"].includes((event.target as HTMLElement).tagName)
  ) {
    event.preventDefault();
    primaryAction();
  }
  if (phase === "build" && ["1", "2", "3", "4"].includes(event.key))
    selectTool(
      (["house", "break", "station", "erase"] as Tool[])[Number(event.key) - 1],
    );
});
function autoPause(): void {
  if (phase === "running") {
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
  const elapsed = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  if (phase === "running" && sim) {
    accumulator += elapsed * speed;
    while (accumulator >= RULES.dt && !sim.done) {
      step(sim);
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
  requestAnimationFrame(frame);
}
save();
syncUI();
requestAnimationFrame(frame);
