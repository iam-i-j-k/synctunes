import { create } from 'zustand';

const useRoomStore = create((set) => ({
  currentRoom: null,
  members: [],
  tracks: [],

  setRoom: (roomOrUpdater) =>
    set((state) => ({
      currentRoom:
        typeof roomOrUpdater === 'function'
          ? roomOrUpdater(state.currentRoom)
          : roomOrUpdater,
    })),
  setMembers: (members) => set({ members }),
  setTracks: (tracks) => set({ tracks }),

  addTrack: (track) =>
    set((state) => {
      if (state.tracks.some(t => t._id === track._id)) return state;
      return { tracks: [...state.tracks, track] };
    }),

  removeTrack: (trackId) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t._id !== trackId),
    })),

  clearRoom: () => set({ currentRoom: null, members: [], tracks: [] }),
}));

export default useRoomStore;
