/**
 * TV / Fire Stick D-pad spatial navigation.
 * Header ↔ hero ↔ title rows. Footer is never in the focus graph.
 * Unknown remotes latch into TV mode on the first D-pad / Back / Select press.
 */

let latchedTv = false;

function getDocumentTop(el: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

function getDocumentLeft(el: HTMLElement): number {
  let left = 0;
  let node: HTMLElement | null = el;
  while (node) {
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return left;
}

function isVisible(el: HTMLElement): boolean {
  if (el.getAttribute("aria-hidden") === "true") return false;
  const st = getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") return false;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

const TV_UA =
  /AFT|FireTV|BRAVIA|SmartTV|SMART-TV|Tizen|Web0S|webOS|VIDAA|HbbTV|AppleTV|CrKey|Android TV|AndroidTV|GoogleTV|Leanback|MIBOX|MiTV|SHIELD|Hisense|PhilipsTV|NetCast|Opera TV|SmartCast|Vizio|Freebox|TV Build|AOSP on|Xbox|PlayStation/i;

export function latchTvRemote() {
  if (latchedTv) return;
  latchedTv = true;
  try { sessionStorage.setItem("ttflix_is_tv", "1"); } catch { /* ignore */ }
  document.documentElement.classList.add("is-tv");
}

export function isTvDevice(): boolean {
  if (latchedTv) return true;
  try {
    if (sessionStorage.getItem("ttflix_is_tv") === "1") return true;
  } catch { /* ignore */ }
  try {
    const android = (window as any).AndroidDevice;
    if (android && typeof android.isTV === "function" && android.isTV()) return true;
  } catch { /* ignore */ }
  return TV_UA.test(navigator.userAgent || "");
}

export function applyTvClass() {
  if (isTvDevice()) document.documentElement.classList.add("is-tv");
  else document.documentElement.classList.remove("is-tv");
}

export function isTvBackKey(e: KeyboardEvent): boolean {
  return e.key === "Escape" || e.key === "GoBack" || e.key === "Back" ||
    e.key === "BrowserBack" || e.key === "XF86Back";
}

export function isTvActivateKey(e: KeyboardEvent): boolean {
  return e.key === "Select" || e.key === "Accept" || e.key === "MediaSelect";
}

export function arrowDir(e: KeyboardEvent): "up" | "down" | "left" | "right" | null {
  const k = e.key;
  if (k === "ArrowUp" || k === "Up") return "up";
  if (k === "ArrowDown" || k === "Down") return "down";
  if (k === "ArrowLeft" || k === "Left") return "left";
  if (k === "ArrowRight" || k === "Right") return "right";
  const c = e.keyCode || e.which;
  if (c === 38) return "up";
  if (c === 40) return "down";
  if (c === 37) return "left";
  if (c === 39) return "right";
  return null;
}

function zoneOf(el: HTMLElement | null): string {
  return el?.closest("[data-tv-zone]")?.getAttribute("data-tv-zone") ?? "";
}

function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-tv-card]"))
    .filter((el) => !el.closest("[data-tv-player]") && isVisible(el));
}

function zoneItems(zone: string): HTMLElement[] {
  const root = document.querySelector(`[data-tv-zone="${zone}"]`);
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>("a, button, [data-tv-card], [tabindex]:not([tabindex='-1'])")
  ).filter((el) => {
    if (el.closest("[data-tv-ignore]")) return false;
    if (el.closest("[data-tv-player]")) return false;
    if (el.tabIndex < 0 && !el.hasAttribute("data-tv-card")) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    return isVisible(el);
  });
}

function pageFocusables(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "a, button, input, select, textarea, [data-tv-card], [tabindex]:not([tabindex='-1'])"
    )
  ).filter((el) => {
    if (el.closest("[data-tv-ignore]")) return false;
    if (el.closest("[data-tv-zone='footer']")) return false;
    if (el.closest("[data-tv-player]") && !el.hasAttribute("data-tv-chrome")) return false;
    if (el.tabIndex < 0 && !el.hasAttribute("data-tv-card")) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    return isVisible(el);
  });
}

function focusEl(el: HTMLElement | null | undefined) {
  if (!el) return false;
  el.focus();
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

function sameRow(a: HTMLElement, b: HTMLElement): boolean {
  return Math.abs(getDocumentTop(a) - getDocumentTop(b)) <= 48;
}

function moveInList(list: HTMLElement[], current: HTMLElement | null, dir: 1 | -1): boolean {
  if (!list.length) return false;
  if (!current) return focusEl(list[dir === 1 ? 0 : list.length - 1]);
  const idx = list.indexOf(current);
  if (idx < 0) {
    const closest = list.reduce((best, el) => {
      const d = Math.abs(getDocumentLeft(el) - getDocumentLeft(current));
      const bd = Math.abs(getDocumentLeft(best) - getDocumentLeft(current));
      return d < bd ? el : best;
    });
    return focusEl(closest);
  }
  const next = list[idx + dir];
  if (!next) return true;
  return focusEl(next);
}

function nearestCard(from: HTMLElement, dir: "up" | "down"): HTMLElement | null {
  const all = cards();
  if (!all.length) return null;
  const currentTop = getDocumentTop(from);
  const currentCenterX = getDocumentLeft(from) + from.offsetWidth / 2;
  const currentCenterY = currentTop + from.offsetHeight / 2;
  const threshold = Math.max(24, from.offsetHeight * 0.4);

  const candidates = all.filter((card) => {
    if (card === from) return false;
    const cardCenterY = getDocumentTop(card) + card.offsetHeight / 2;
    return dir === "down"
      ? cardCenterY > currentCenterY + threshold
      : cardCenterY < currentCenterY - threshold;
  });
  if (!candidates.length) return null;

  const sorted = [...candidates].sort((a, b) => {
    const diff = getDocumentTop(a) - getDocumentTop(b);
    return dir === "down" ? diff : -diff;
  });
  const firstTop = getDocumentTop(sorted[0]);
  const nearestRow = sorted.filter((card) => Math.abs(getDocumentTop(card) - firstTop) <= 48);
  return nearestRow.reduce((closest, card) => {
    const cardCenterX = getDocumentLeft(card) + card.offsetWidth / 2;
    const closestCenterX = getDocumentLeft(closest) + closest.offsetWidth / 2;
    return Math.abs(cardCenterX - currentCenterX) < Math.abs(closestCenterX - currentCenterX)
      ? card : closest;
  });
}

function firstHero(): HTMLElement | null {
  return zoneItems("hero")[0] ?? null;
}

function firstHeader(): HTMLElement | null {
  return zoneItems("header")[0] ?? null;
}

function currentHeaderLink(): HTMLElement | null {
  const items = zoneItems("header");
  return items.find((el) => el.getAttribute("aria-current") === "page") ?? firstHeader();
}

function firstCard(): HTMLElement | null {
  return cards()[0] ?? null;
}

function tabItems(): HTMLElement[] {
  return zoneItems("tabs");
}

function firstTab(): HTMLElement | null {
  return tabItems()[0] ?? null;
}

function nearestTab(from: HTMLElement, dir: "up" | "down"): HTMLElement | null {
  const all = tabItems();
  if (!all.length) return null;
  const currentTop = getDocumentTop(from);
  const currentCenterX = getDocumentLeft(from) + from.offsetWidth / 2;
  const currentCenterY = currentTop + from.offsetHeight / 2;
  const threshold = Math.max(16, from.offsetHeight * 0.3);

  const candidates = all.filter((el) => {
    if (el === from) return false;
    const elCenterY = getDocumentTop(el) + el.offsetHeight / 2;
    return dir === "down"
      ? elCenterY > currentCenterY + threshold
      : elCenterY < currentCenterY - threshold;
  });
  if (!candidates.length) return null;

  const sorted = [...candidates].sort((a, b) => {
    const diff = getDocumentTop(a) - getDocumentTop(b);
    return dir === "down" ? diff : -diff;
  });
  const firstTop = getDocumentTop(sorted[0]);
  const nearestRow = sorted.filter((el) => Math.abs(getDocumentTop(el) - firstTop) <= 48);
  return nearestRow.reduce((closest, el) => {
    const elCenterX = getDocumentLeft(el) + el.offsetWidth / 2;
    const closestCenterX = getDocumentLeft(closest) + closest.offsetWidth / 2;
    return Math.abs(elCenterX - currentCenterX) < Math.abs(closestCenterX - currentCenterX)
      ? el : closest;
  });
}

function cwWrap(el: HTMLElement | null): HTMLElement | null {
  return el?.closest("[data-tv-cw]") ?? null;
}

function cwRemove(from: HTMLElement): HTMLElement | null {
  return cwWrap(from)?.querySelector<HTMLElement>("[data-tv-remove]") ?? null;
}

function cwCard(from: HTMLElement): HTMLElement | null {
  return cwWrap(from)?.querySelector<HTMLElement>("[data-tv-card]") ?? null;
}

function cwWraps(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-tv-cw]")).filter(isVisible);
}

function mainItems(): HTMLElement[] {
  const hero = new Set(zoneItems("hero"));
  const cardSet = new Set(cards());
  const tabSet = new Set(tabItems());
  return zoneItems("main").filter((el) =>
    !hero.has(el) &&
    !cardSet.has(el) &&
    !tabSet.has(el) &&
    !el.closest("[data-tv-card]") &&
    !el.closest("[data-tv-cw]") &&
    !el.closest("[data-tv-zone='tabs']")
  );
}

function firstMain(): HTMLElement | null {
  return mainItems()[0] ?? null;
}

function playerChrome(): HTMLElement[] {
  const root = document.querySelector("[data-tv-player]");
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>("[data-tv-chrome]")).filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    return isVisible(el);
  });
}

function firstPlayerChrome(): HTMLElement | null {
  return playerChrome()[0] ?? null;
}

function firstPageItem(): HTMLElement | null {
  return firstPlayerChrome() ?? firstHero() ?? firstTab() ?? firstCard() ?? firstMain() ?? firstHeader() ?? pageFocusables()[0] ?? null;
}

/** @deprecated kept for MovieCard callers; spatial nav is global on TV */
export function navigateVertical(current: HTMLElement, dir: "up" | "down") {
  const next = nearestCard(current, dir);
  if (next) {
    focusEl(next);
    return;
  }
  if (dir === "up") {
    if (focusEl(firstHero())) return;
    focusEl(firstHeader());
  }
}

/** Land focus on hero/cards if nothing useful is focused (or footer stole it). */
export function ensureTvFocus() {
  if (!isTvDevice()) return;
  const active = document.activeElement as HTMLElement | null;
  if (active && zoneOf(active) === "footer") {
    focusEl(cards()[cards().length - 1] ?? firstHero() ?? firstHeader());
    return;
  }
  if (!active || active === document.body || active === document.documentElement) {
    focusEl(firstPageItem());
  }
}

export function handleTvArrow(e: KeyboardEvent): boolean {
  if (!isTvDevice()) return false;
  const dir = arrowDir(e);
  if (!dir) return false;

  const active = document.activeElement as HTMLElement | null;
  const inField = !!(active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable));

  // Leave text fields on Up/Down so remotes can reach the rest of the page.
  if (inField) {
    if (dir === "left" || dir === "right") return false;
    return moveInList(pageFocusables(), active, dir === "down" ? 1 : -1);
  }

  // Watch / live player: D-pad stays on overlay chrome, except the X —
  // any direction off the exit button so OK/Enter can play the video.
  const watching = !!document.querySelector("[data-tv-player]");
  if (watching && !active?.closest("[data-tv-zone='modal']")) {
    if (active?.closest("[data-season-picker] .absolute")) return false;
    const items = playerChrome();
    if (items.length) {
      if (active?.hasAttribute("data-tv-exit")) {
        active.blur();
        return true;
      }
      if (!active?.closest("[data-tv-player]")) return focusEl(items[0]);
      if (dir === "left" || dir === "right") {
        return moveInList(items, active, dir === "right" ? 1 : -1);
      }
      if (dir === "up") return focusEl(items[0]);
      return focusEl(items[items.length - 1]);
    }
  }

  const modalRoot = document.querySelector("[data-tv-zone='modal']") as HTMLElement | null;
  if (modalRoot && !active?.closest("[data-tv-player]")) {
    const items = Array.from(
      modalRoot.querySelectorAll<HTMLElement>("a, button, input, [tabindex]:not([tabindex='-1'])")
    ).filter((el) => !el.closest("[data-tv-ignore]") && isVisible(el) && el.tabIndex >= 0);
    if (items.length) {
      if (!active?.closest("[data-tv-zone='modal']")) return focusEl(items[0]);
      if (dir === "left" || dir === "right") {
        return moveInList(items, active, dir === "right" ? 1 : -1);
      }
      return moveInList(items, active, dir === "down" ? 1 : -1);
    }
  }

  const zone = zoneOf(active);
  const allCards = cards();
  const page = pageFocusables();

  if (!active || active === document.body || zone === "footer") {
    if (zone === "footer") {
      return focusEl(allCards[allCards.length - 1] ?? firstCard() ?? firstHero() ?? firstHeader() ?? page[0]);
    }
    return focusEl(firstPageItem());
  }

  if (dir === "left" || dir === "right") {
    const step: 1 | -1 = dir === "right" ? 1 : -1;
    if (zone === "header" || zone === "hero") {
      return moveInList(zoneItems(zone), active, step);
    }
    if (zone === "tabs") {
      const row = tabItems().filter((el) => sameRow(el, active));
      row.sort((a, b) => getDocumentLeft(a) - getDocumentLeft(b));
      return moveInList(row.length ? row : tabItems(), active, step);
    }
    if (active?.hasAttribute("data-tv-remove")) {
      const wraps = cwWraps();
      const wrap = cwWrap(active);
      const idx = wrap ? wraps.indexOf(wrap) : -1;
      const next = idx >= 0 ? wraps[idx + step] : null;
      if (!next) return true;
      return focusEl(next.querySelector<HTMLElement>("[data-tv-remove]") ?? next.querySelector<HTMLElement>("[data-tv-card]"));
    }
    if (allCards.includes(active)) {
      const row = allCards.filter((c) => sameRow(c, active));
      row.sort((a, b) => getDocumentLeft(a) - getDocumentLeft(b));
      return moveInList(row, active, step);
    }
    const mains = mainItems();
    if (mains.includes(active)) return moveInList(mains, active, step);
    if (page.includes(active) || page.length) return moveInList(page, active, step);
    return focusEl(firstCard() ?? firstHero() ?? firstMain() ?? active);
  }

  if (dir === "down") {
    if (active?.hasAttribute("data-tv-remove")) {
      return focusEl(cwCard(active) ?? active);
    }
    if (zone === "header") {
      return focusEl(firstHero() ?? firstTab() ?? firstCard() ?? firstMain() ?? page[0] ?? active);
    }
    if (zone === "hero") {
      return focusEl(firstTab() ?? firstCard() ?? firstMain() ?? active);
    }
    if (zone === "tabs") {
      const nextTab = nearestTab(active, "down");
      if (nextTab) return focusEl(nextTab);
      return focusEl(firstCard() ?? active);
    }
    const next = nearestCard(active, "down");
    if (next) return focusEl(next);
    if (allCards.length) return true;
    return moveInList(page.length ? page : mainItems(), active, 1);
  }

  // up
  if (zone === "header") return true;
  if (zone === "hero") return focusEl(firstHeader() ?? active);
  if (zone === "tabs") {
    const prevTab = nearestTab(active, "up");
    if (prevTab) return focusEl(prevTab);
    return focusEl(firstHero() ?? currentHeaderLink() ?? firstHeader() ?? active);
  }
  if (active?.hasAttribute("data-tv-remove")) {
    return focusEl(firstHero() ?? firstHeader() ?? active);
  }
  if (allCards.includes(active)) {
    const remove = cwRemove(active);
    if (remove) return focusEl(remove);
  }
  const prev = nearestCard(active, "up");
  if (prev) return focusEl(prev);
  if (allCards.includes(active) || zone === "main") {
    return focusEl(nearestTab(active, "up") ?? firstTab() ?? firstHero() ?? firstHeader() ?? active);
  }
  if (page.includes(active)) return moveInList(page, active, -1);
  return focusEl(firstTab() ?? firstHero() ?? firstHeader() ?? page[0] ?? active);
}
