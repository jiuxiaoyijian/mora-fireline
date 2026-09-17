/** Orbit/zoom changes the camera, not the drawing buffer. Resize only when needed. */
export function updateRenderSize(renderer: {
  domElement: { width: number; height: number };
  getPixelRatio(): number;
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
}, width: number, height: number, ratio: number): void {
  if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
  if (renderer.domElement.width !== Math.floor(width * ratio) || renderer.domElement.height !== Math.floor(height * ratio)) renderer.setSize(width, height, false);
}
