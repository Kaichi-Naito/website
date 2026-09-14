// Keep song selection synchronized with the card that is actually centered in the wheel.
// This complements the legacy offsetTop-based handler in game.mjs, which can drift on
// touch scrolling / scroll snapping in some mobile browsers.
if (typeof document !== 'undefined') {
  const wheel = document.getElementById('song-wheel');
  if (wheel) {
    let timer = 0;

    const selectCenteredSong = () => {
      const items = [...wheel.querySelectorAll('.song-option')];
      if (!items.length) return;

      const wheelRect = wheel.getBoundingClientRect();
      const centerY = wheelRect.top + wheelRect.height / 2;
      let nearest = null;
      let nearestDistance = Infinity;

      for (const item of items) {
        const rect = item.getBoundingClientRect();
        const itemCenterY = rect.top + rect.height / 2;
        const distance = Math.abs(itemCenterY - centerY);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = item;
        }
      }

      if (nearest && nearest.getAttribute('aria-selected') !== 'true') {
        nearest.click();
      }
    };

    const scheduleSelectionSync = delay => {
      clearTimeout(timer);
      timer = window.setTimeout(selectCenteredSong, delay);
    };

    wheel.addEventListener('scroll', () => scheduleSelectionSync(150), {passive:true});
    wheel.addEventListener('scrollend', selectCenteredSong, {passive:true});
    wheel.addEventListener('pointerup', () => scheduleSelectionSync(180), {passive:true});
    wheel.addEventListener('touchend', () => scheduleSelectionSync(180), {passive:true});
  }
}
