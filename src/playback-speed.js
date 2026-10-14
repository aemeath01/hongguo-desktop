// The menu selection belongs to the open player session. Observed mpv speed
// may be a temporary key hold, so it must never overwrite this value.
export function createPlaybackSpeed(initial = 1) {
  let selected = Number.isFinite(initial) && initial >= 0.25 && initial <= 4 ? initial : 1;
  return {
    get value() { return selected; },
    select(value) {
      if (Number.isFinite(value) && value >= 0.25 && value <= 4) selected = value;
      return selected;
    },
    forEpisode(preferences) { return {...preferences, speed: selected}; },
  };
}
