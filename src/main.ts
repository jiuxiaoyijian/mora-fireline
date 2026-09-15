import "./style.css";
import { GameAudio } from "./audio.ts";
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
    <a class="brand" href="./"><span class="brand-icon">${svg("fire")}</span><span>火线街区<small>FIRELINE / 林缘小镇的火险季</small></span></a>
    <div class="header-right"><button id="menu-open" class="quiet">标题</button><button id="sound" class="quiet" aria-pressed="false">声音：关</button><span class="version">单关体验 · v0.2 开发中</span><button id="help-open" class="quiet">玩法说明 <span>?</span></button></div>
  </header>
  <main>
    <section class="intro"><div><div class="eyebrow">01 / 松风镇 · 山火将至</div><h1>让风过去，让家留下。</h1><p>为 12 户家庭规划家园，用防火带与喷淋守住至少 8 栋。</p></div><div class="objective"><span>本次目标</span><strong>8<span> / 12</span></strong><small>栋住宅未燃烧、未烧毁</small></div></section>
    <div class="workspace">
      <aside class="sidebar">
        <section class="panel build-panel"><div class="section-label"><h2>街区工具</h2><span id="phase-badge">准备阶段</span></div>
          <div class="resources"><div><span>已安置住宅</span><strong id="homes">12 <small>/ 12</small></strong></div><div><span>剩余防灾预算</span><strong id="budget">12 <small>点</small></strong></div></div>
          <div class="tools" role="group" aria-label="建造工具">
            <button data-tool="house" class="tool" aria-pressed="false">${svg("house")}<span><b>住宅</b><small>选中住宅 → 点击空地搬迁</small></span><kbd>1</kbd></button>
            <button data-tool="break" class="tool selected" aria-pressed="true">${svg("break")}<span><b>防火带</b><small>隔断传播 · 1 点 / 格</small></span><kbd>2</kbd></button>
            <button data-tool="station" class="tool" aria-pressed="false">${svg("station")}<span><b>蓄水喷淋</b><small>预防起火 · 4 点 / 座</small></span><kbd>3</kbd></button>
            <button data-tool="erase" class="tool" aria-pressed="false">${svg("erase")}<span><b>拆除</b><small>退还预算或住宅</small></span><kbd>4</kbd></button>
          </div>
          <p class="tool-note" id="tool-note">点击草地或住宅铺设防火带。住宅被替换后，需要在其他位置补齐。</p>
          <div class="small-actions"><button id="undo" disabled>撤销</button><button id="cancel-move" hidden>取消搬迁</button><button id="reset-layout">默认街区</button><button id="clear-layout">清空重建</button></div>
        </section>
        <section class="panel forecast"><div class="eyebrow">山火预报 / 同一关条件固定</div><div class="wind"><span>西</span><span class="wind-arrow">⟶</span><strong>向东吹</strong></div><p>山外雷暴引起山火，正向小镇靠近。<br>空地也会燃烧，连续隔离才有效。</p><div class="forecast-foot"><span>模拟时长 <b>45 秒</b></span><span>目标 <b>≥ 8 栋</b></span></div></section>
        <div class="save-status" id="save-status">布局自动保存在此浏览器</div>
      </aside>
      <section class="game-panel" aria-label="家园防线">
        <div class="map-toolbar"><span class="live-label"><i id="state-dot"></i><b id="map-status">规划家园</b></span><div class="map-toggles"><button id="coverage" aria-pressed="false">喷淋覆盖</button><button id="routes" aria-pressed="false">传播路径</button></div></div>
        <div class="map-wrap"><div id="scene"></div><div class="map-caption"><span>街区 01</span><small>8 × 8 / 西侧为火线</small></div><div class="hover-tip" id="hover-tip">选择工具后，点击格子进行建造</div><div id="warning-overlay" class="warning-overlay" hidden><span class="eyebrow">居民已转移 · 守住大家的家园</span><strong>山火即将抵达</strong><p>风向：西 → 东</p><b id="warning-count">3</b></div><div id="pause-overlay" class="pause-overlay" hidden><span>守护已暂停</span><small>布局与火势已保留</small><button id="overlay-resume" class="primary">继续守护</button></div></div>
        <div class="control-bar"><div class="time-block"><span id="time-label">等待开始</span><div class="progress-track"><div id="progress"></div></div><small id="time">00.0 / 45.0 秒</small></div><div class="control-buttons"><button id="skip-result" class="speed" hidden>查看结果</button><button id="speed" class="speed" aria-label="切换模拟速度">1×</button><button id="primary" class="primary">准备好了 <span>→</span></button></div></div>
        <div class="insight" id="insight"><span class="insight-number">01</span><div><strong>先为家园添一道防线。</strong><p>试着在西侧草地放一格防火带，看看预算如何变化；还可以撤销。孤立一格不保证挡住山火。</p></div></div>
      </section>
    </div>
    <section class="report panel" id="report" hidden aria-label="防线复盘"><div class="report-head"><div><div class="eyebrow">AFTER THE FIRE / 家园回望</div><h2 id="report-title"></h2><p id="comparison"></p></div><div class="report-score" id="report-score"></div></div><div class="report-body"><div><h3>这次发生了什么</h3><p id="report-reason"></p><ol id="event-list"></ol></div><div class="report-next"><h3>再守一次家园</h3><p>返回建造，调整一处布局，再用相同火情验证你的判断。</p><div><button id="edit-again" class="primary">调整布局 →</button><button id="retry" class="secondary">原样重试</button></div></div></div></section>
    <details class="accessible-map"><summary>键盘建造网格与地图状态</summary><p>与 3D 地图同步。选好工具后，用 Tab 选择格子并按 Enter 建造。</p><div id="grid" class="a11y-grid" role="group" aria-label="街区建造网格"></div></details>
    <footer><span>FIRELINE · 每一道防线，都为家园而建。</span><span>规划家园 · 观察火势 · 改善防线</span></footer>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="help"><form method="dialog"><button class="dialog-close" aria-label="关闭玩法说明">×</button></form><div class="eyebrow">FIELD GUIDE / 玩法说明</div><h2>在山火来临之前，守住家园。</h2><ol class="help-steps"><li><b>先建一道防线。</b>用防火带隔断传播，用蓄水喷淋预防起火。安置好 12 栋家园后点击「准备好了」。山火沿风向由西向东进入。</li><li><b>找出原因。</b>实验后查看实际传播记录，也可以打开地图上的传播路径。</li><li><b>改变布局。</b>防火带不燃烧；蓄水喷淋在两格步行距离内共享降温能力。已燃烧的住宅无法被救回。</li><li><b>再次验证。</b>保住至少 8 栋住宅即达标。同样布局与火情，结果完全相同。</li></ol><p class="help-tip">开始前需放满 12 栋住宅；防灾预算为 12 点。快捷键 1–4 切换工具，空格开始 / 暂停。住宅工具可直接搬迁；撤销恢复上一步，Esc 取消搬迁。预警与火势失焦自动暂停。当前以桌面操作为主。</p><button id="help-close" class="primary">回到街区 →</button></dialog>
`;

app.insertAdjacentHTML(
  "beforeend",
  `
  <dialog id="title-screen" class="title-card" aria-labelledby="title-heading">
    <div class="eyebrow">FIRELINE / 林缘小镇的火险季</div><h2 id="title-heading">火线街区</h2><p class="title-tagline">让风过去，<br>让家留下。</p>
    <p>你是松风镇新社区的规划者。<br>山火将至，为 12 户家庭留住家园。</p>
    <div class="title-facts"><span>建造防线</span><span>观察火势</span><span>再试一次</span></div>
    <button id="enter-town" class="primary">进入小镇 →</button><button id="title-sound" class="quiet" aria-pressed="false">声音：关</button>
    <small id="continue-note">单个街区 · 自由准备 · 45 秒火情，可加速</small>
  </dialog>
  <dialog id="outcome" class="outcome-card" aria-labelledby="outcome-heading"><div class="eyebrow">AFTER THE FIRE / 风过之后</div><h2 id="outcome-heading"></h2><div id="home-lights" class="home-lights" aria-hidden="true"></div><p id="outcome-summary"></p><p id="outcome-tip"></p><div class="outcome-actions"><button id="outcome-edit" class="primary">保留布局，改善防线 →</button><button id="outcome-details" class="secondary">看看火从哪里来</button></div></dialog>
`,
);
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
    house: "点击住宅拿起，再点击草地搬迁；Esc 取消。库存中有住宅时可直接安置。",
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
  );
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
    `${String.fromCharCode(65 + x)}${z + 1} · ${NAMES[layout[i]]}${status}${!buildable(i) ? " · 不可建造" : phase === "build" ? (moving >= 0 ? " · 点击空地完成搬迁" : prospective?.error ? ` · ${prospective.error}` : ` · ${tool === "station" ? "喷淋 4 点 · 预览覆盖" : tool === "break" ? "防火带 1 点" : tool === "house" ? "住宅 / 搬迁 0 点" : "拆除退还资源"}`) : ""}`;
}
function selectCell(i: number): void {
  hoverCell(i);
  if (phase !== "build") {
    toast("实验期间不能改建。结算后选择「调整布局」。");
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
      return `<button data-cell="${i}" class="grid-${kind}" ${!buildable(i) || phase !== "build" ? "disabled" : ""} aria-label="${label}"><small>${String.fromCharCode(65 + x)}${z + 1}</small>${kind === "house" ? "宅" : kind === "station" ? "喷" : kind === "break" ? "隔" : kind === "source" ? "火" : kind === "stone" ? "石" : "草"}</button>`;
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
  const labels: Record<Phase, string> = {
    build: "准备阶段",
    warning: "山火预警",
    running: "模拟中",
    paused: "已暂停",
    finished: "已结算",
  };
  el("phase-badge").textContent = labels[phase];
  el("map-status").textContent =
    phase === "build"
      ? "规划家园"
      : `实验 ${String(experiment).padStart(2, "0")} · ${labels[phase]}`;
  el("state-dot").classList.toggle("running", phase === "running");
  el("warning-overlay").hidden = phase !== "warning";
  el("cancel-move").hidden = moving < 0 || phase !== "build";
  el<HTMLButtonElement>("undo").disabled =
    phase !== "build" || history.length === 0;
  el("skip-result").hidden =
    !sim || !(phase === "running" || phase === "paused");
  el("pause-overlay").hidden = phase !== "paused";
  const primary = el<HTMLButtonElement>("primary");
  primary.innerHTML =
    phase === "build"
      ? "准备好了 <span>→</span>"
      : phase === "running" || phase === "warning"
        ? "暂停守护 <span>Ⅱ</span>"
        : phase === "paused"
          ? "继续守护 <span>→</span>"
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
      `<span class="insight-number">${String(r.saved).padStart(2, "0")}</span><div><strong>栋住宅尚未燃烧 · ${r.burning} 栋燃烧中 · ${r.destroyed} 栋已烧毁</strong><p>火焰不能穿过防火带，但会从缺口绕行。打开「喷淋覆盖」观察保护范围。</p></div>`;
  }
}
function start(): void {
  if (!canStart(layout)) {
    toast("请先安置全部 12 栋住宅。");
    return;
  }
  moving = -1;
  sim = null;
  phase = "warning";
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
  el<HTMLDialogElement>("outcome").close();
  phase = "build";
  el("report").hidden = true;
  sim = null;
  accumulator = 0;
  view.setLayout(layout);
  el("insight").innerHTML =
    `<span class="insight-number">↗</span><div><strong>保留布局，验证下一个想法。</strong><p>${lastResult ? `上次保住 ${lastResult.saved} 栋。` : ""}每次只改动一处，会更容易看清变化的原因。</p></div>`;
  syncUI();
  el("primary").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function primaryAction(): void {
  if (
    el<HTMLDialogElement>("title-screen").open ||
    el<HTMLDialogElement>("outcome").open
  )
    return;
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
  el("report").hidden = false;
  el("report-title").textContent = r.success
    ? "街区守住了。"
    : "火留下了下一次的线索。";
  el("report-score").innerHTML =
    `<strong>${r.saved}<small> / 12</small></strong><span>${r.success ? "达到保护目标" : `距目标还差 ${RULES.goal - r.saved} 栋`}</span>`;
  el("comparison").textContent = previousResult
    ? `同一场向东蔓延的山火：上次 ${previousResult.saved} 栋 → 本次 ${r.saved} 栋。${diff > 0 ? `多保住了 ${diff} 栋。` : diff < 0 ? `少保住了 ${-diff} 栋，试着检查新出现的缺口。` : "结果相同，可以验证另一种布局。"}`
    : "这是本次会话的第一次实验。调整后再试，比较布局的效果。";
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
      return `<li><span>${(event.tick * RULES.dt).toFixed(1)}s</span> ${from} ${NAMES[layout[event.source]]} → ${to} 住宅</li>`;
    })
    .join("");
  el("insight").innerHTML =
    `<span class="insight-number">${String(r.saved).padStart(2, "0")}</span><div><strong>${r.success ? "达到目标！" : "实验结束。"}保住 ${r.saved} / 12 栋住宅</strong><p>${previousResult ? `上次 ${previousResult.saved} 栋，本次 ${r.saved} 栋。` : "首次结果已记录。"}向下查看实验复盘，再调整布局。</p></div>`;
  toast(
    `实验结束：保住 ${r.saved} / 12 栋住宅。${r.success ? "达到目标！" : "调整布局，再试一次。"}`,
  );
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
  el("outcome-summary").textContent =
    `保住 ${r.saved} / 12 栋 · ${r.success ? "完成保护目标" : `距离目标还差 ${RULES.goal - r.saved} 栋`} · 使用 ${counts(layout).spent} / 12 点预算${previousResult ? ` · 比上次${diff >= 0 ? "多" : "少"} ${Math.abs(diff)} 栋` : ""}`;
  const first = ignitions[0];
  const point = first ? coords(first.target) : null;
  el("outcome-tip").textContent = point
    ? `先回看 ${String.fromCharCode(65 + point.x)}${point.z + 1}：它在 ${(first.tick * RULES.dt).toFixed(1)} 秒最先起火。试着调整附近隔离或喷淋覆盖，再比较。`
    : "所有住宅都未起火。下一次可以保留保护效果，尝试节省一点预算。";
  el<HTMLDialogElement>("outcome").showModal();
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
el("reset-layout").addEventListener("click", () =>
  replaceLayout(defaultLayout(), true),
);
el("clear-layout").addEventListener("click", () =>
  replaceLayout(blankLayout(), false),
);
const help = el<HTMLDialogElement>("help");
el("help-open").addEventListener("click", () => {
  autoPause();
  help.showModal();
});
el("help-close").addEventListener("click", () => help.close());
document.addEventListener("keydown", (event) => {
  if (
    help.open ||
    el<HTMLDialogElement>("title-screen").open ||
    el<HTMLDialogElement>("outcome").open ||
    /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName)
  )
    return;
  if (event.key === "Escape" && moving >= 0) {
    selectTool(tool);
    toast("已取消搬迁。");
  }
  if (
    phase === "build" &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "z"
  ) {
    event.preventDefault();
    undo();
  }
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
el("skip-result").addEventListener("click", () => {
  if (!sim || !(phase === "running" || phase === "paused")) return;
  while (!sim.done) step(sim);
  finish();
});
const title = el<HTMLDialogElement>("title-screen");
function openTitle(): void {
  autoPause();
  document.body.classList.add("title-screen");
  const activeRun = phase === "paused";
  el("enter-town").textContent = activeRun
    ? "回到本次守护 →"
    : storedLayout
      ? "继续我的规划 →"
      : "进入小镇 →";
  el("continue-note").textContent = activeRun
    ? "本次进程已暂停，返回后可继续"
    : storedLayout
      ? "恢复此浏览器保存的布局 · 火情将重新开始"
      : "自由准备 · 45 秒火情 · 可加速或直接看结果";
  title.showModal();
}
function enterTown(): void {
  title.close();
  document.body.classList.remove("title-screen");
  el("primary").focus({ preventScroll: true });
}
el("menu-open").addEventListener("click", openTitle);
el("enter-town").addEventListener("click", enterTown);
title.addEventListener("cancel", (event) => {
  event.preventDefault();
  enterTown();
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
  el<HTMLDialogElement>("outcome").close();
  el("report").scrollIntoView({ behavior: "smooth", block: "start" });
});
save();
syncUI();
openTitle();
requestAnimationFrame(frame);
