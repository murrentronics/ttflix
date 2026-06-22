/**
 * TV remote D-pad vertical navigation helper.
 * Finds the best card to focus when pressing ArrowUp/ArrowDown,
 * escaping overflow-x scroll containers that would otherwise trap focus.
 */
export function navigateVertical(current: HTMLElement, dir: "up" | "down") {
  const allCards = Array.from(
    document.querySelectorAll<HTMLElement>("[data-tv-card]")
  );
  if (!allCards.length) return;

  const currentRect = current.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;

  const candidates = allCards.filter((card) => {
    if (card === current) return false;
    const rect = card.getBoundingClientRect();
    const cardCenterY = rect.top + rect.height / 2;
    return dir === "down"
      ? cardCenterY > currentCenterY + 20
      : cardCenterY < currentCenterY - 20;
  });

  if (!candidates.length) return;

  const best = candidates.reduce((closest, card) => {
    const rect = card.getBoundingClientRect();
    const closestRect = closest.getBoundingClientRect();
    const cardVertDist = Math.abs(rect.top - currentRect.top);
    const closestVertDist = Math.abs(closestRect.top - currentRect.top);
    // Prefer same row (closest vertical), break ties by horizontal proximity
    if (Math.abs(cardVertDist - closestVertDist) > 30) {
      return cardVertDist < closestVertDist ? card : closest;
    }
    const cardCenterX = rect.left + rect.width / 2;
    const closestCenterX = closestRect.left + closestRect.width / 2;
    return Math.abs(cardCenterX - currentCenterX) < Math.abs(closestCenterX - currentCenterX)
      ? card : closest;
  });

  best.focus();
  best.scrollIntoView({ block: "nearest", inline: "nearest" });
}
