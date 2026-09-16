/** In-stage dialogs keep the same scale as the game, with modal focus semantics. */
export class GameDialogs {
  private stack: { node: HTMLElement; returnTo: HTMLElement | null }[] = [];
  constructor(private stage: HTMLElement) {
    stage.addEventListener("keydown", (event) => {
      const top = this.stack.at(-1)?.node;
      if (!top || event.key !== "Tab") return;
      const focusable = this.focusable(top);
      if (!focusable.length) {
        event.preventDefault();
        top.focus();
        return;
      }
      const first = focusable[0], last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === top)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }
  get current(): string | undefined { return this.stack.at(-1)?.node.id; }
  open(id: string): void {
    if (this.stack.some(entry => entry.node.id === id)) return;
    const node = document.getElementById(id)!;
    this.stack.push({ node, returnTo: document.activeElement as HTMLElement | null });
    node.hidden = false;
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.tabIndex = -1;
    if (node instanceof HTMLDialogElement) node.show();
    this.sync();
    (this.focusable(node)[0] ?? node).focus({ preventScroll: true });
  }
  close(): void {
    const entry = this.stack.pop();
    if (!entry) return;
    if (entry.node instanceof HTMLDialogElement) entry.node.close();
    else entry.node.hidden = true;
    entry.node.removeAttribute("aria-modal");
    this.sync();
    if (entry.returnTo?.isConnected && !entry.returnTo.closest("[inert]"))
      entry.returnTo.focus({ preventScroll: true });
  }
  closeAll(): void { while (this.stack.length) this.close(); }
  private focusable(node: HTMLElement): HTMLElement[] {
    return [...node.querySelectorAll<HTMLElement>("button:not(:disabled), [href], [tabindex='0'], summary")]
      .filter(element => !element.hidden && element.getClientRects().length > 0);
  }
  private sync(): void {
    const top = this.stack.at(-1)?.node;
    for (const child of this.stage.children) {
      if (!(child instanceof HTMLElement)) continue;
      child.inert = !!top && child !== top && child.id !== "modal-shade";
    }
    const shade = document.getElementById("modal-shade")!;
    shade.hidden = !top;
    shade.style.zIndex = String(50 + Math.max(0, this.stack.length - 1) * 2);
    this.stack.forEach(({ node }, i) => { node.style.zIndex = String(51 + i * 2); });
  }
}
