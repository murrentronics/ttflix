/**
 * TV remote D-pad vertical navigation helper.
 * Uses document-relative offsetTop (not viewport-relative getBoundingClientRect)
 * so off-screen rows are reachable even before they scroll into view.
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

export function navigateVertical(current: HTMLElement, dir: "up" | "down") {
  // Only navigate among browse cards (data-tv-card elements that are NOT
  // inside the player overlay). Player controls handle their own focus.
  const allCards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-tv-card]")
  ).filter((el) => !el.closest("[data-tv-player]"));

  if (!allCards.length) return;

  const currentTop = getDocumentTop(current);
  const currentLeft = getDocumentLeft(current);
  const currentCenterX = currentLeft + current.offsetWidth / 2;
  const currentCenterY = currentTop + current.offsetHeight / 2;

  // Cards meaningfully above or below (more than half a card height away)
  const threshold = current.offsetHeight * 0.5;

  const candidates = allCards.filter((card) => {
    if (card === current) return false;
    const cardCenterY = getDocumentTop(card) + card.offsetHeight / 2;
    return dir === "down"
      ? cardCenterY > currentCenterY + threshold
      : cardCenterY < currentCenterY - threshold;
  });

  if (!candidates.length) return;

  // Group candidates by row — cards whose tops are within 40px of each other
  // are considered the same row. This prevents skipping rows when scrolling up.
  const sorted = [...candidates].sort((a, b) => {
    const diff = getDocumentTop(a) - getDocumentTop(b);
    return dir === "down" ? diff : -diff;
  });

  // Find the top value of the nearest row
  const firstTop = getDocumentTop(sorted[0]);
  const ROW_TOLERANCE = 40; // px — cards within this vertical range are one row

  // Only consider cards in the nearest row
  const nearestRow = sorted.filter(
    (card) => Math.abs(getDocumentTop(card) - firstTop) <= ROW_TOLERANCE
  );

  // Within the nearest row pick the card whose horizontal center is closest
  const best = nearestRow.reduce((closest, card) => {
    const cardCenterX = getDocumentLeft(card) + card.offsetWidth / 2;
    const closestCenterX = getDocumentLeft(closest) + closest.offsetWidth / 2;
    return Math.abs(cardCenterX - currentCenterX) < Math.abs(closestCenterX - currentCenterX)
      ? card : closest;
  });

  best.focus();
  best.scrollIntoView({ block: "nearest", inline: "nearest" });
}
