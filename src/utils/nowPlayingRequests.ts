// The top bar's 🎵 button asks the Now Playing pop-up to come up (components/NowPlayingPopup listens).

const requests = new Set<() => void>();

/** Brings up the Now Playing pop-up (mute and next song). */
export function showNowPlaying(): void {
  requests.forEach((r) => r());
}

/** The pop-up listens for the requests; returns the way to stop listening. */
export function onNowPlayingRequest(listener: () => void): () => void {
  requests.add(listener);
  return () => {
    requests.delete(listener);
  };
}
