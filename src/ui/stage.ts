/** Fixed design coordinates; canvas picking still uses its displayed client rect. */
export function fitStage(stage: HTMLElement): void {
  const resize = () => {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    stage.style.setProperty("--stage-scale", String(scale));
    window.dispatchEvent(new Event("stage-resize"));
  };
  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", resize);
  resize();
}
