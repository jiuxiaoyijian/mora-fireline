/** HUD uses CSS pixels; the scene independently tracks the available viewport. */
export function fitStage(stage: HTMLElement): void {
  const resize = () => {
    stage.style.height = `${window.visualViewport?.height ?? window.innerHeight}px`;
    window.dispatchEvent(new Event("stage-resize"));
  };
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", resize);
  resize();
}
