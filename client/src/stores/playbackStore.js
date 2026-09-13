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

  currentTrackSource: null,

  // Epoch counter: increments only on real play/pause/trackChange/seek events,
  // NOT on heartbeat sync updates. The AudioPlayer effect depends on this
  // instead of serverStartTime/startPosition to avoid recreating the Howl
  // on every heartbeat response.
  playbackEpoch: 0,

  setClockSync: (offset, rtt) => set({ clientServerOffset: offset, currentRtt: rtt }),

  getServerNow: () => Date.now() + get().clientServerOffset,

  ytPlayer: null,
  setYtPlayer: (player) => set({ ytPlayer: player }),

  loadAndPlayTrack: (url, serverStartTime, startPosition, source, youtubeId) => {
    const { howlInstance: currentHowl, ytPlayer, syncInterval } = get();
    
    // Cleanup Howler
    if (currentHowl) {
      if (syncInterval) clearInterval(syncInterval);
      try { currentHowl.stop(); } catch(e) {}
      try { currentHowl.unload(); } catch(e) {}
      set({ howlInstance: null });
    }
    // Cleanup YouTube
    if (ytPlayer && source !== 'YOUTUBE') {
      try { ytPlayer.pauseVideo(); } catch (e) {}
    }
    // Force-stop all Howler audio globally as a safety net
    try { Howler.stop(); } catch(e) {}

    const correctedNow = get().getServerNow();
    const elapsedSeconds = (correctedNow - serverStartTime) / 1000;
    const targetPosition = Math.max(0, startPosition + elapsedSeconds);

    if (source === 'YOUTUBE') {
      // For YouTube, we just set the store state. 
      // The AudioPlayer component watches this state and calls ytPlayer methods.
      set({
        currentTrackSource: source,
        pendingYoutubeId: youtubeId,
        serverStartTime,
        startPosition,
        isPlaying: true,
      });
      // If ytPlayer is already ready, instruct it to seek and play
      if (ytPlayer) {
        try {
          // If it's a new video, load it. Otherwise just seek.
          // We rely on AudioPlayer to call loadVideoById if the ID changes,
          // but if it's the same video resuming, we just seek and play.
          ytPlayer.seekTo(targetPosition, true);
          ytPlayer.playVideo();
        } catch (e) {
          console.error('ytPlayer seek/play error:', e);
        }
      }
      return;
    }

    // For uploaded tracks, use Howler
    let finalUrl = url;
    const formatHint = finalUrl.includes('youtube/stream') ? ['m4a', 'mp3'] : undefined;

    const howlInstance = new Howl({
      src: [finalUrl],
      format: formatHint,
      html5: true,
      preload: true,
      onload: function() {
        // Prevent race condition: if the user switched tracks before this loaded, abort!
        if (get().howlInstance !== this) {
          this.unload();
          return;
        }

        const currentElapsed = (get().getServerNow() - get().serverStartTime) / 1000;
        const currentTarget = get().startPosition + currentElapsed;
        this.seek(Math.max(0, currentTarget));
        this.play();
      }
    });

    set({
      howlInstance,
      currentTrackSource: source,
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
    if (state.ytPlayer) {
      try { 
        pos = state.ytPlayer.getCurrentTime() || pos; 
        state.ytPlayer.pauseVideo();
      } catch (e) {}
    }
    set({
      howlInstance: null,
      isPlaying: false,
      startPosition: pos,
    });
  },

  // Called for authoritative state changes (play, pause, trackChange, seek, mode).
  // Increments playbackEpoch so the AudioPlayer effect knows to reload.
  applyPlaybackUpdate: (playbackState, actionSequence, currentTrackId, playbackMode) => {
    set((state) => {
      // Detect if this is a meaningful state change that should trigger Howl reload:
      // - isPlaying changed (play/pause)
      // - currentTrackId changed (track change)
      // - actionSequence jumped (seek, mode change, or any new server action)
      const isNewAction = actionSequence !== state.actionSequence;

      return {
        playbackState,
        actionSequence,
        currentTrackId,
        playbackMode: playbackMode !== undefined ? playbackMode : state.playbackMode,
        
        serverStartTime: playbackState.serverStartTime,
        startPosition: playbackState.startPosition,
        isPlaying: playbackState.isPlaying,

        // Only bump epoch on actual state transitions, not heartbeat echoes
        playbackEpoch: isNewAction ? state.playbackEpoch + 1 : state.playbackEpoch,
      };
    });
  },

  // Called by heartbeat responses — updates timing data for drift correction
  // without bumping playbackEpoch, so the AudioPlayer doesn't re-create Howl.
  applySyncUpdate: (playbackState, actionSequence) => {
    set({
      serverStartTime: playbackState.serverStartTime,
      startPosition: playbackState.startPosition,
    });
  },

  clearPlayer: () => {
    const state = get();
    if (state.howlInstance) {
      state.howlInstance.unload();
    }
    if (state.ytPlayer) {
      try { state.ytPlayer.stopVideo(); } catch (e) {}
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
      playbackEpoch: 0,
    });
  },
}));

export default usePlaybackStore;
