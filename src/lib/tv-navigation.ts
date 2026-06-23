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
  const allCards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-tv-card]")
  );
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

  const best = candidates.reduce((closest, card) => {
    const cardTop = getDocumentTop(card);
    const closestTop = getDocumentTop(closest);
    const cardVertDist = Math.abs(cardTop - currentTop);
    const closestVertDist = Math.abs(closestTop - currentTop);

    // First pick the nearest row vertically (within 60px = same row tolerance)
    if (Math.abs(cardVertDist - closestVertDist) > 60) {
      return cardVertDist < closestVertDist ? card : closest;
    }
    // Same row — pick closest column (horizontal proximity)
    const cardCenterX = getDocumentLeft(card) + card.offsetWidth / 2;
    const closestCenterX = getDocumentLeft(closest) + closest.offsetWidth / 2;
    return Math.abs(cardCenterX - currentCenterX) < Math.abs(closestCenterX - currentCenterX)
      ? card : closest;
  });

  best.focus();
  best.scrollIntoView({ block: "nearest", inline: "nearest" });
}
