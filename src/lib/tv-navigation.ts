/**
 * TV / Fire Stick D-pad spatial navigation.
 * Header ↔ hero ↔ title rows. Footer is never in the focus graph.
 */

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

export function isTvDevice(): boolean {
  try {
    const android = (window as any).AndroidDevice;
    if (android && typeof android.isTV === "function" && android.isTV()) return true;
  } catch { /* ignore */ }
  const ua = navigator.userAgent || "";
  return /AFT|AFTA|AFTT|AFTN|AFTS|AFTKM|AFTJM|FireTV|BRAVIA|SmartTV|SMART-TV|Tizen|Web0S|webOS|VIDAA|HbbTV|AppleTV|CrKey|Android TV|GoogleTV/i.test(ua);
}

export function applyTvClass() {
  if (isTvDevice()) document.documentElement.classList.add("is-tv");
  else document.documentElement.classList.remove("is-tv");
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
  if (!next) return true; // stay put — never wrap into another region here
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

function firstCard(): HTMLElement | null {
  return cards()[0] ?? null;
}

function mainItems(): HTMLElement[] {
  const hero = new Set(zoneItems("hero"));
  const cardSet = new Set(cards());
  return zoneItems("main").filter((el) => !hero.has(el) && !cardSet.has(el) && !el.closest("[data-tv-card]"));
}

function firstMain(): HTMLElement | null {
  return mainItems()[0] ?? null;
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
    focusEl(firstHero() ?? firstCard() ?? firstMain() ?? firstHeader());
  }
}

export function handleTvArrow(e: KeyboardEvent): boolean {
  if (!isTvDevice()) return false;
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
    return false;
  }

  const active = document.activeElement as HTMLElement | null;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
    return false;
  }

  // Native/web player chrome owns the remote while watching.
  if (active?.closest("[data-tv-player]") || document.querySelector("[data-tv-player] iframe")) {
    if (!active?.closest("[data-tv-zone='modal']")) return false;
  }

  const modalRoot = document.querySelector("[data-tv-zone='modal']") as HTMLElement | null;
  const modal = (active?.closest("[data-tv-zone='modal']") as HTMLElement | null) ?? modalRoot;
  if (modal && (active?.closest("[data-tv-zone='modal']") || !active || active === document.body)) {
    const items = Array.from(
      modal.querySelectorAll<HTMLElement>("a, button, [tabindex]:not([tabindex='-1'])")
    ).filter((el) => !el.closest("[data-tv-ignore]") && isVisible(el) && el.tabIndex >= 0);
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      return moveInList(items, active?.closest("[data-tv-zone='modal']") ? active : null, e.key === "ArrowRight" ? 1 : -1);
    }
    return moveInList(items, active?.closest("[data-tv-zone='modal']") ? active : null, e.key === "ArrowDown" ? 1 : -1);
  }

  const zone = zoneOf(active);
  const allCards = cards();

  if (!active || active === document.body || zone === "footer") {
    if (zone === "footer") {
      return focusEl(allCards[allCards.length - 1] ?? firstCard() ?? firstHero() ?? firstHeader());
    }
    return focusEl(firstHero() ?? firstCard() ?? firstMain() ?? firstHeader());
  }

  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const dir: 1 | -1 = e.key === "ArrowRight" ? 1 : -1;
    if (zone === "header" || zone === "hero") {
      return moveInList(zoneItems(zone), active, dir);
    }
    if (allCards.includes(active)) {
      const row = allCards.filter((c) => sameRow(c, active));
      row.sort((a, b) => getDocumentLeft(a) - getDocumentLeft(b));
      return moveInList(row, active, dir);
    }
    const mains = mainItems();
    if (mains.includes(active)) return moveInList(mains, active, dir);
    return focusEl(firstCard() ?? firstHero() ?? firstMain() ?? active);
  }

  if (e.key === "ArrowDown") {
    if (zone === "header") {
      return focusEl(firstHero() ?? firstCard() ?? firstMain() ?? active);
    }
    if (zone === "hero") {
      return focusEl(firstCard() ?? firstMain() ?? active);
    }
    const next = nearestCard(active, "down");
    if (next) return focusEl(next);
    if (allCards.length) return true; // last row stays put — never drop into footer
    return moveInList(mainItems(), active, 1);
  }

  // ArrowUp
  if (zone === "header") return true;
  if (zone === "hero") return focusEl(firstHeader() ?? active);
  const prev = nearestCard(active, "up");
  if (prev) return focusEl(prev);
  if (allCards.includes(active) || zone === "main") {
    return focusEl(firstHero() ?? firstHeader() ?? active);
  }
  return focusEl(firstHero() ?? firstHeader() ?? active);
}
