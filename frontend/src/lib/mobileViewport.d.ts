export function keyboardIsOpen(state: {
  baseline: number;
  height: number;
  scale: number;
  focused: boolean;
  touch: boolean;
}): boolean;
export function installMobileViewport(win?: Window, doc?: Document): () => void;
