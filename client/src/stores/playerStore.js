import { create } from 'zustand';

const usePlayerStore = create((set, get) => ({
  playbackState: {
    isPlaying: false,
    startedAtServerTime: 0,
    pausedAtOffsetMs: 0,
  },
  actionSequence: 0,
  currentTrackId: null,
  serverTimeOffset: 0, // NTP-derived offset: add to Date.now() to get server time

  applyPlaybackUpdate: (playbackState, actionSequence, currentTrackId) =>
    set({ playbackState, actionSequence, currentTrackId }),

  setClockOffset: (offset) => set({ serverTimeOffset: offset }),

  // Derived helper: corrected server time
  getServerNow: () => Date.now() + get().serverTimeOffset,

  // Derived helper: authoritative playback position in ms
  getAuthorisedPositionMs: () => {
    const { playbackState, serverTimeOffset } = get();
    const serverNow = Date.now() + serverTimeOffset;
    if (playbackState.isPlaying) {
      return Math.max(0, serverNow - playbackState.startedAtServerTime);
    }
    return playbackState.pausedAtOffsetMs;
  },
}));

export default usePlayerStore;
