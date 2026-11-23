const editableSelector =
  'textarea,[contenteditable="true"],input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="hidden"]):not([type="color"])';
export function keyboardIsOpen({ baseline, height, scale, focused, touch }) {
  // Pinch zoom also shrinks VisualViewport. Never treat it as a keyboard or suppress zoom.
  return (
    touch &&
    focused &&
    Math.abs(scale - 1) < 0.02 &&
    baseline - height > Math.max(100, baseline * 0.18)
  );
}
export function installMobileViewport(win = window, doc = document) {
  const viewport = win.visualViewport;
  if (!viewport) return () => {};
  const root = doc.documentElement,
    touch = win.matchMedia("(any-pointer: coarse)");
  let baseline = viewport.height,
    width = win.innerWidth,
    frame = 0;
  const update = () => {
    frame = 0;
    const target = doc.activeElement;
    const focused = Boolean(target?.matches?.(editableSelector));
    const unzoomed = Math.abs(viewport.scale - 1) < 0.02;
    if (unzoomed && (!focused || Math.abs(width - win.innerWidth) > 60))
      baseline = Math.max(win.innerHeight, viewport.height);
    width = win.innerWidth;
    if (!unzoomed) {
      root.removeAttribute("data-keyboard");
      root.style.removeProperty("--visual-viewport-height");
      root.style.removeProperty("--visual-viewport-top");
      return;
    }
    root.style.setProperty(
      "--visual-viewport-height",
      `${Math.round(viewport.height)}px`,
    );
    root.style.setProperty(
      "--visual-viewport-top",
      `${Math.round(viewport.offsetTop)}px`,
    );
    const open = keyboardIsOpen({
      baseline,
      height: viewport.height,
      scale: viewport.scale,
      focused,
      touch: touch.matches,
    });
    if (open) root.setAttribute("data-keyboard", "open");
    else root.removeAttribute("data-keyboard");
    if (open) {
      const rect = target.getBoundingClientRect(),
        top = viewport.offsetTop + 16,
        bottom = viewport.offsetTop + viewport.height - 16;
      if (rect.bottom > bottom || rect.top < top)
        target.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
    }
  };
  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(update);
  };
  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  win.addEventListener("resize", schedule);
  doc.addEventListener("focusin", schedule);
  doc.addEventListener("focusout", schedule);
  update();
  return () => {
    win.cancelAnimationFrame(frame);
    viewport.removeEventListener("resize", schedule);
    viewport.removeEventListener("scroll", schedule);
    win.removeEventListener("resize", schedule);
    doc.removeEventListener("focusin", schedule);
    doc.removeEventListener("focusout", schedule);
    root.removeAttribute("data-keyboard");
    root.style.removeProperty("--visual-viewport-height");
    root.style.removeProperty("--visual-viewport-top");
  };
}
