const icons = {
  house: '<path d="m3 10 9-7 9 7M6 9v11h12V9M10 20v-7h4v7"/>',
  break: '<path d="M4 5h16M4 12h16M4 19h16M7 5v14M17 5v14"/>',
  station: '<path d="M4 20V8h16v12H4ZM9 20v-6h6v6M12 2v8M8 6h8"/>',
  erase: '<path d="m4 13 9-9 7 7-9 9H8l-4-4v-3ZM9 8l7 7M12 20h9"/>',
  fire: '<path d="M12 2c1 6 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 4-7 0 3 1 4 2 5 2-3 0-6 0-10Z"/>',
};
export const svg = (name: keyof typeof icons) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

export const gameTemplate = `
<div id="game-stage">
  <main id="game-world" aria-label="火线街区游戏">
    <div id="scene" aria-label="家园防线三维场景"></div><div class="scene-vignette"></div>
    <header class="hud-top">
      <button id="mission-open" class="mission-slip" aria-label="查看防灾委托"><span class="eyebrow">松风镇 · <span id="phase-badge">准备阶段</span></span><strong id="goal-label">目标：至少保住 8 户</strong><small id="live-homes" hidden></small></button>
      <div class="resource-ribbon"><div id="homes-resource"><span>保护对象</span><strong id="homes">12 / 12</strong></div><div id="budget-resource"><span>预算</span><strong id="budget">12 点</strong></div><button id="menu-open" class="icon-button" aria-label="打开游戏菜单">☰</button></div>
    </header>
    <div class="wind-label"><strong id="wind-current"></strong><small id="weather-plan"></small></div><aside class="lesson-card"><strong id="lesson-title"></strong><p id="lesson-text"></p><div><button id="hint-open">巡护提示</button><small id="lesson-progress">先读委托，观察火源，再布置防线。</small></div><p id="lesson-hint" hidden></p></aside><div id="fire-feedback" class="fire-feedback" role="status">橙线：地面受热 · 绿线：被阻断 · 青圈：屋顶湿润</div>
    <div class="map-toolbar">
      <details id="layers-panel"><summary>地图辅助</summary><div class="map-toggles paper-panel"><button id="coverage" aria-pressed="false">喷淋覆盖</button><button id="routes" aria-pressed="false">传播路径</button><button id="grid-guides" aria-pressed="false">规划格线</button><button id="grid-open">键盘网格</button></div></details>
      <details id="camera-panel"><summary>镜头</summary><div class="camera-dock paper-panel" role="group" aria-label="镜头控制"><p>滚轮缩放 · 右键环视<br>触屏可用下方按钮</p><div><button id="camera-in" aria-label="拉近镜头">＋</button><button id="camera-out" aria-label="拉远镜头">－</button><button id="camera-up">俯视</button><button id="camera-down">低视角</button><button id="camera-reset">复位镜头</button></div></div></details>
    </div>
    <div id="warning-overlay" class="warning-overlay" hidden><span class="eyebrow">防线演练即将开始</span><strong>按预报检查防线</strong><p>风向变化与飞火落点会实时提示</p><b id="warning-count">3</b></div>
    <div id="pause-overlay" class="pause-overlay" hidden><span>演练已暂停</span><small>布局与火情已保留</small><button id="overlay-resume" class="primary">继续演练</button></div>
    <div class="hover-tip" id="hover-tip" hidden></div>
    <div class="build-dock">
      <div class="dock-top"><span id="tool-note">防火带 · 1 点/格，拖动可连续铺设</span></div>
      <div class="dock-main"><div class="tools" role="group" aria-label="建造工具">
        <button data-tool="house" class="tool" aria-pressed="false">${svg("house")}<span><b>查看</b><small>固定房屋</small></span><kbd>1</kbd></button>
        <button data-tool="break" class="tool selected" aria-pressed="true">${svg("break")}<span><b>防火带</b><small>1 点/格</small></span><kbd>2</kbd></button>
        <button data-tool="station" class="tool" aria-pressed="false">${svg("station")}<span><b>喷淋</b><small>4 点/座</small></span><kbd>3</kbd></button>
        <button data-tool="erase" class="tool" aria-pressed="false">${svg("erase")}<span><b>拆除</b><small>返还资源</small></span><kbd>4</kbd></button>
        <button id="undo" aria-label="撤销上一步" disabled>↶</button>
      </div><div class="control-bar"><div class="time-block"><span id="time-label">等待开始</span><small id="time">00.0 / 45.0 秒</small><div class="progress-track"><div id="progress"></div></div></div><div class="control-buttons"><button id="review-result" hidden>查看复盘</button><button id="skip-result" hidden>查看结果</button><button id="speed" aria-label="切换模拟速度">1×</button><button id="primary" class="primary">开始演练 →</button></div></div></div>
    </div>
    <div class="save-status" id="save-status">布局自动保存在此浏览器</div>
  </main>
  <dialog id="mission-dialog" aria-labelledby="mission-heading"><button id="mission-close" class="dialog-close" aria-label="关闭委托">×</button><span class="eyebrow">松风镇巡护站 · 防灾委托</span><h2 id="mission-heading">让家园等到他们回来</h2><p id="mission-description"></p><div id="mission-targets" class="mission-targets"></div><p id="mission-status"></p><div id="insight" class="insight"></div></dialog>
  <div id="modal-shade" hidden></div>
  <section class="report" id="report" hidden role="dialog" aria-modal="true" aria-labelledby="report-title" tabindex="-1"><button id="report-close" class="dialog-close" aria-label="关闭复盘">×</button><div class="report-head"><div class="eyebrow">演练报告 · 点选记录定位</div><h2 id="report-title"></h2><div class="report-score" id="report-score"></div></div><div class="report-body"><ol id="event-list"></ol><details class="report-explanation"><summary>结果与来源说明</summary><p id="comparison"></p><p id="report-completion" hidden></p><p id="report-reason"></p></details><div class="report-next"><div><button id="edit-again" class="primary">调整布局 →</button><button id="retry" class="secondary">原样重试</button></div></div></div></section>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="help" aria-labelledby="help-heading"><form method="dialog"><button class="dialog-close" aria-label="关闭玩法说明">×</button></form><div class="eyebrow">巡护手册 / 玩法说明</div><h2 id="help-heading">在山火来临之前，守住家园。</h2><ol class="help-steps"><li><b>房屋是固定目标。</b>每关有不同的地图、预算和风情。你只能布置或拆除防护设施，不能移动住宅。</li><li><b>防火带挡地面，喷淋护屋顶。</b>隔离带每格 1 点。喷淋每座 4 点，两步内共享每秒 72 降温能力，湿润住宅可拦截飞火；不能扑灭已燃烧建筑。</li><li><b>提前看懂危险。</b>橙线表示当前地面热输入，绿线表示被防火带阻断。橙色落点圈预警 1.5 秒后的飞火，飞火可跳 2–3 格。木屋受热 40 起火，蓝灰顶砖屋为 90。</li><li><b>验证，再调整。</b>达到本关目标解锁下一关；全保得两星，全保且达到本关节约预算目标得三星（见委托）。同样方案与关卡，结果相同。</li></ol><p class="help-tip">1 查看 · 2 防火带 · 3 喷淋 · 4 拆除<br>空格开始/暂停 · Ctrl/Cmd+Z 撤销 · Esc 返回/菜单<br>每关防线、星级与解锁进度保存在此浏览器，火情进程不跨刷新保存。</p><button id="help-close" class="primary">明白了 →</button></dialog>
  <div class="title-scene-label" aria-hidden="true"><span>01 / 松风镇</span><strong>山海之间，留一盏归家的灯。</strong><small>一场关于规划与守护的微缩实验</small></div>
  <dialog id="title-screen" class="title-card" aria-labelledby="title-heading">
    <div class="title-brand"><svg class="patrol-emblem" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M32 3 56 16v30L32 60 8 46V16Z" stroke="currentColor" stroke-width="1.5"/><path d="m16 34 9-16 10 16 7-10 8 15M21 46h22M27 45V34l5-4 5 4v11M32 10v5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>松风镇巡护站<small>SONGFENG · FIELD NOTES</small></span></div>
    <div class="title-wordmark"><div class="title-kicker"><span>防灾规划手记</span><i></i><span>VOL. 01</span></div><h2 id="title-heading">火线<span>街区</span></h2><div class="title-english" aria-hidden="true">F I R E L I N E</div></div>
    <p class="title-tagline">在山火抵达之前，<br>为他们守住回家的路。</p>
    <p class="title-story">八次值守，一座小镇。<br>你的每一处规划，都可能改变它的明天。</p>
    <div class="title-actions"><button id="enter-town" class="primary">接受委托 →</button><button id="title-new" class="title-secondary">选择关卡</button><small id="continue-note">先规划，再验证</small></div>
    <div class="title-utilities"><button id="title-help">玩法说明</button><span aria-hidden="true">/</span><button id="title-sound" aria-pressed="false">声音：关</button></div>
    <div class="title-colophon"><span>规划 · 演练 · 守护</span><span>8 次委托 / 渐进挑战</span></div>
  </dialog>
  <dialog id="pause-menu" class="pause-card" aria-labelledby="pause-heading"><div class="eyebrow">松风镇巡护站</div><h2 id="pause-heading">歇一会儿，再出发。</h2><p>布局已保留；运行中的演练已暂停。</p><div class="menu-stack"><button id="pause-close" class="primary">返回游戏</button><button id="pause-restart" class="secondary">返回建造，调整布局</button><div class="menu-settings"><button id="sound" aria-pressed="false">声音：关</button><button id="quality">画质：标准</button><button id="fullscreen" aria-label="切换全屏">切换全屏</button><button id="help-open">玩法说明</button></div><details class="danger-zone"><summary>重新规划</summary><p>以下操作会替换布局，可在建造期使用。</p><button id="reset-layout">重置本关防线</button><button id="clear-layout">清空本关设施</button></details><button id="levels-open" class="secondary">值守地图 · 选择关卡</button><button id="pause-title" class="quiet">返回标题</button></div></dialog>
  <dialog id="grid-dialog" class="grid-dialog" aria-labelledby="grid-heading"><button id="grid-close" class="dialog-close" aria-label="关闭键盘网格">×</button><div class="eyebrow">KEYBOARD / 键盘建造</div><h2 id="grid-heading">街区地图</h2><p>数字 1–4 选择工具，Tab 选择地块，Enter 建造。错行六边形与三维地图对应，岩带不可建造。</p><div class="grid-scroll"><div id="grid" class="a11y-grid" role="group" aria-label="街区建造网格"></div></div></dialog>
  <dialog id="outcome" class="outcome-card" aria-labelledby="outcome-heading"><div class="eyebrow">松风镇 · 本次演练结果</div><h2 id="outcome-heading"></h2><div id="home-lights" class="home-lights" aria-hidden="true"></div><p id="outcome-summary"></p><p id="outcome-mission" class="mission-verdict"></p><p id="outcome-completion" hidden></p><p id="outcome-tip"></p><div class="outcome-actions"><button id="next-level" class="primary" hidden>前往下一关 →</button><button id="outcome-edit" class="primary">保留布局，改善防线 →</button><button id="outcome-details" class="secondary">看看火从哪里来</button></div></dialog>
<dialog id="level-select" aria-labelledby="levels-heading"><button id="levels-close" class="dialog-close" aria-label="关闭关卡选择">×</button><span class="eyebrow">巡护路线 / 八次值守</span><h2 id="levels-heading">沿着山海，守住家园。</h2><p>通关后解锁下一次委托。已完成的关卡可回访，尝试用更少预算完成保护。</p><div id="level-list"></div></dialog>
</div>`;
