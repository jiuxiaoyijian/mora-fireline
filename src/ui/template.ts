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
    <div id="scene" aria-label="家园防线三维场景"></div>
    <div class="scene-vignette"></div>
    <div class="hud-top">
      <div class="town-label"><span class="eyebrow">松风镇巡护站 / 防灾规划席</span><h1>松风镇</h1><span id="phase-badge">准备阶段</span></div>
      <div class="resource-ribbon"><div class="goal-resource"><span>守护目标</span><strong>8 <small>/ 12 栋</small></strong></div><div><span>安置住宅</span><strong id="homes">12 <small>/ 12</small></strong></div><div><span>防灾预算</span><strong id="budget">12 <small>点</small></strong></div><div class="wind-resource"><span>山火来向</span><strong>西 <span>→</span> 东</strong></div></div>
      <div class="system-actions"><button id="fullscreen" class="icon-button" aria-label="切换全屏">⛶</button><button id="sound" class="quiet" aria-pressed="false">声音：关</button><button id="help-open" class="icon-button" aria-label="玩法说明">?</button><button id="menu-open" class="icon-button" aria-label="打开游戏菜单">☰</button></div>
    </div>
    <div class="map-toolbar"><span class="live-label"><i id="state-dot"></i><b id="map-status">规划家园</b></span><div class="map-toggles"><button id="coverage" aria-pressed="false">喷淋覆盖</button><button id="routes" aria-pressed="false">传播路径</button><button id="grid-guides" aria-pressed="false">规划格线</button><button id="grid-open">键盘网格</button></div></div>
    <div class="insight" id="insight"><span class="insight-number">01</span><div><strong>先为家园添一道防线。</strong><p>天然岩带隔开两片家园。先守住一片，再扩大保护；可拖动铺设防火带。</p></div></div>
    <section class="mission-card" aria-label="本次委托"><span class="eyebrow">值守委托 · 01</span><h2>让 12 户人家有家可归</h2><p>你是镇上的防灾规划员。居民已转移，请为返乡保住家园。</p><div class="mission-targets"><span><b>8 户</b>最低承诺</span><span><b>12 户</b>完整守护</span></div><p id="mission-status">先规划防线，再用演练验证。</p></section><div id="warning-overlay" class="warning-overlay" hidden><span class="eyebrow">防线演练即将开始 · 不改变真实布局</span><strong>模拟山火逼近</strong><p>风向：西 → 东</p><b id="warning-count">3</b></div>
    <div id="pause-overlay" class="pause-overlay" hidden><span>守护已暂停</span><small>布局与火势已保留</small><button id="overlay-resume" class="primary">继续守护</button></div>
    <div class="hover-tip" id="hover-tip">选择工具后，点击格子进行建造</div>
    <div class="camera-dock" role="group" aria-label="镜头控制"><span>滚轮缩放 · 右键拖动环视</span><div><button id="camera-in" aria-label="拉近镜头">＋</button><button id="camera-out" aria-label="拉远镜头">－</button><button id="camera-up">俯视</button><button id="camera-down">低视角</button><button id="camera-reset">复位镜头</button></div></div><div class="build-dock">
      <div class="dock-top"><span id="tool-note">防火带隔断传播；替换住宅后需在其他位置补齐。</span><div class="small-actions"><button id="undo" disabled>撤销</button><button id="cancel-move" hidden>取消搬迁</button><button id="reset-layout">默认街区</button><button id="clear-layout">清空重建</button></div></div>
      <div class="dock-main"><div class="tools" role="group" aria-label="建造工具">
        <button data-tool="house" class="tool" aria-pressed="false">${svg("house")}<span><b>住宅</b><small>选中后搬迁</small></span><kbd>1</kbd></button>
        <button data-tool="break" class="tool selected" aria-pressed="true">${svg("break")}<span><b>防火带</b><small>1 点 / 格</small></span><kbd>2</kbd></button>
        <button data-tool="station" class="tool" aria-pressed="false">${svg("station")}<span><b>蓄水喷淋</b><small>4 点 / 座</small></span><kbd>3</kbd></button>
        <button data-tool="erase" class="tool" aria-pressed="false">${svg("erase")}<span><b>拆除</b><small>退还资源</small></span><kbd>4</kbd></button>
      </div><div class="control-bar"><div class="time-block"><span id="time-label">等待开始</span><small id="time">00.0 / 45.0 秒</small><div class="progress-track"><div id="progress"></div></div></div><div class="control-buttons"><button id="review-result" class="speed" hidden>查看复盘</button><button id="skip-result" class="speed" hidden>查看结果</button><button id="speed" class="speed" aria-label="切换模拟速度">1×</button><button id="primary" class="primary">准备好了 <span>→</span></button></div></div></div>
    </div>
    <div class="save-status" id="save-status">布局自动保存在此浏览器</div><span class="version">FIRELINE · 单关体验 / 开发中</span>
  </main>
  <div id="modal-shade" hidden></div>
  <section class="report" id="report" hidden role="dialog" aria-modal="true" aria-labelledby="report-title" tabindex="-1"><button id="report-close" class="dialog-close" aria-label="关闭复盘">×</button><div class="report-head"><div><div class="eyebrow">AFTER THE FIRE / 家园回望</div><h2 id="report-title"></h2><p id="comparison"></p></div><div class="report-score" id="report-score"></div></div><div class="report-body"><div><h3>这次发生了什么</h3><p id="report-completion" hidden></p><p id="report-reason"></p><ol id="event-list"></ol></div><div class="report-next"><h3>再守一次家园</h3><p>调整一处布局，再用相同火情验证你的判断。</p><div><button id="edit-again" class="primary">调整布局 →</button><button id="retry" class="secondary">原样重试</button></div></div></div></section>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="help" aria-labelledby="help-heading"><form method="dialog"><button class="dialog-close" aria-label="关闭玩法说明">×</button></form><div class="eyebrow">FIELD GUIDE / 玩法说明</div><h2 id="help-heading">在山火来临之前，守住家园。</h2><ol class="help-steps"><li><b>先建一道防线。</b>用防火带隔断传播，用蓄水喷淋预防起火。安置好 12 栋住宅后开始，山火自西向东进入。</li><li><b>看懂防线。</b>草地会燃烧，天然岩带不传火。六边形有六个传播邻居，缺口可能被绕过。喷淋在两步六边形距离内共享降温能力，无法救回已燃烧的住宅。</li><li><b>观察与调整。</b>模拟可暂停、加速或直接查看结果；住宅全部烧毁后自动跳过剩余演出。根据实际传播记录调整，再试一次。</li><li><b>守住家园。</b>保住至少 8 栋即达标。同样布局与火情，结果完全相同。</li></ol><p class="help-tip">预算 12 点 · 防火带 1 点 / 格 · 喷淋 4 点 / 座<br>1–4 切换工具 · 空格开始 / 暂停 · Ctrl/Cmd+Z 撤销 · Esc 取消搬迁 / 打开菜单<br>失焦自动暂停；布局保存于本浏览器，撤销历史与模拟进程不跨刷新保存。</p><button id="help-close" class="primary">明白了 →</button></dialog>
  <dialog id="title-screen" class="title-card" aria-labelledby="title-heading"><div class="eyebrow">松风镇巡护站 · 山火防线演练</div><h2 id="title-heading">火线街区</h2><p class="title-tagline">他们已撤离，<br>家园托付给你。</p><p class="title-story"><b>你的身份：松风镇防灾规划员</b><br>西侧山火风险正在上升。用 12 点预算，<br>为至少 8 户人家保住住宅，争取全部守住。</p><div class="title-facts"><span>接受委托</span><i>→</i><span>演练验证</span><i>→</i><span>完善方案</span></div><div class="title-actions"><button id="enter-town" class="primary">进入小镇 →</button><button id="title-new" class="secondary">重新规划</button><div><button id="title-help" class="quiet">玩法说明</button><button id="title-sound" class="quiet" aria-pressed="false">声音：关</button></div></div><small id="continue-note">六边形山谷 · 45 秒火情 · 可加速</small></dialog>
  <dialog id="pause-menu" class="pause-card" aria-labelledby="pause-heading"><div class="eyebrow">松风镇 / 暂歇片刻</div><h2 id="pause-heading">家园会等你回来。</h2><p>当前布局已保留；运行中的火情暂停。</p><div class="menu-stack"><button id="pause-close" class="primary">返回游戏 →</button><button id="pause-restart" class="secondary">返回建造，调整布局</button><button id="quality" class="secondary">画质：标准</button><button id="pause-title" class="quiet">返回主菜单</button></div></dialog>
  <dialog id="grid-dialog" class="grid-dialog" aria-labelledby="grid-heading"><button id="grid-close" class="dialog-close" aria-label="关闭键盘网格">×</button><div class="eyebrow">KEYBOARD / 键盘建造</div><h2 id="grid-heading">街区地图</h2><p>数字 1–4 选择工具，Tab 选择地块，Enter 建造。错行六边形与三维地图对应，岩带不可建造。</p><div id="grid" class="a11y-grid" role="group" aria-label="街区建造网格"></div></dialog>
  <dialog id="outcome" class="outcome-card" aria-labelledby="outcome-heading"><div class="eyebrow">AFTER THE FIRE / 风过之后</div><h2 id="outcome-heading"></h2><div id="home-lights" class="home-lights" aria-hidden="true"></div><p id="outcome-summary"></p><p id="outcome-mission" class="mission-verdict"></p><p id="outcome-completion" hidden></p><p id="outcome-tip"></p><div class="outcome-actions"><button id="outcome-edit" class="primary">保留布局，改善防线 →</button><button id="outcome-details" class="secondary">看看火从哪里来</button></div></dialog>
</div>`;
