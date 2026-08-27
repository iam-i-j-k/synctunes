import { create } from 'zustand';
import { Howl, Howler } from 'howler';

const usePlaybackStore = create((set, get) => ({
  playbackState: {
    isPlaying: false,
    serverStartTime: 0,
    startPosition: 0,
  },
  actionSequence: 0,
  currentTrackId: null,
  playbackMode: 'NORMAL',

  howlInstance: null,
  clientServerOffset: 0,
  currentRtt: 0,
  serverStartTime: 0,
  startPosition: 0,
  isPlaying: false,

  ytPlayer: null,
  currentTrackSource: null,

  setYtPlayer: (player) => set({ ytPlayer: player }),
  setClockSync: (offset, rtt) => set({ clientServerOffset: offset, currentRtt: rtt }),

  getServerNow: () => Date.now() + get().clientServerOffset,

  loadAndPlayTrack: (url, serverStartTime, startPosition, source, youtubeId) => {
    const { howlInstance: currentHowl, syncInterval } = get();
    
    if (currentHowl) {
      if (syncInterval) clearInterval(syncInterval);
      try { currentHowl.stop(); } catch(e) {}
      try { currentHowl.unload(); } catch(e) {}
      set({ howlInstance: null });
    }
    // Force-stop all Howler audio globally as a safety net
    try { Howler.stop(); } catch(e) {}

    if (source === 'YOUTUBE') {
      // Just set state — AudioPlayer will drive the ytPlayer via useEffect
      set({
        howlInstance: null,
        currentTrackSource: 'YOUTUBE',
        pendingYoutubeId: youtubeId,
        serverStartTime,
        startPosition,
        isPlaying: true,
      });
      return;
    }

    const formatHint = url.includes('youtube/stream') ? ['webm', 'mp3'] : undefined;

    const howlInstance = new Howl({
      src: [url],
      format: formatHint,
      html5: true,
      preload: true,
      onload: function() {
        // Prevent race condition: if the user switched tracks before this loaded, abort!
        if (get().howlInstance !== this) {
          this.unload();
          return;
        }
        const correctedNow = get().getServerNow();
        const elapsedSeconds = (correctedNow - serverStartTime) / 1000;
        const targetPosition = startPosition + elapsedSeconds;
        this.seek(Math.max(0, targetPosition));
        this.play();
      }
    });

    set({
      howlInstance,
      currentTrackSource: 'CLOUDINARY',
      pendingYoutubeId: null,
      serverStartTime,
      startPosition,
      isPlaying: true,
    });
  },

  stopTrack: () => {
    const state = get();
    let pos = state.startPosition;
    if (state.howlInstance) {
      try { pos = state.howlInstance.seek() || pos; } catch (e) {}
      state.howlInstance.stop();
      state.howlInstance.unload();
    }
    if (state.ytPlayer && state.currentTrackSource === 'YOUTUBE') {
      try { pos = state.ytPlayer.getCurrentTime() || pos; } catch (e) {}
      state.ytPlayer.pauseVideo();
    }
    set({
      howlInstance: null,
      isPlaying: false,
      startPosition: pos,
    });
  },

  applyPlaybackUpdate: (playbackState, actionSequence, currentTrackId, playbackMode) => {
    set((state) => ({
      playbackState,
      actionSequence,
      currentTrackId,
      playbackMode: playbackMode !== undefined ? playbackMode : state.playbackMode,
      
      serverStartTime: playbackState.serverStartTime,
      startPosition: playbackState.startPosition,
      isPlaying: playbackState.isPlaying,
    }));
  },

  clearPlayer: () => {
    const state = get();
    if (state.howlInstance) {
      state.howlInstance.unload();
    }
    set({
      playbackState: { isPlaying: false, serverStartTime: 0, startPosition: 0 },
      actionSequence: 0,
      currentTrackId: null,
      playbackMode: 'NORMAL',
      howlInstance: null,
      serverStartTime: 0,
      startPosition: 0,
      isPlaying: false,
    });
  },
}));

export default usePlaybackStore;
