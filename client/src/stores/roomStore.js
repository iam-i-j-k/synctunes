import { create } from 'zustand';

const useRoomStore = create((set) => ({
  currentRoom: null,
  members: [],
  tracks: [],
  messages: [],

  setRoom: (roomOrUpdater) =>
    set((state) => ({
      currentRoom:
        typeof roomOrUpdater === 'function'
          ? roomOrUpdater(state.currentRoom)
          : roomOrUpdater,
    })),
  setMembers: (members) => set({ members }),
  setTracks: (tracks) => set({ tracks }),
  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => {
      const newMessages = [...state.messages, message];
      if (newMessages.length > 50) return { messages: newMessages.slice(newMessages.length - 50) };
      return { messages: newMessages };
    }),

  addTrack: (track) =>
    set((state) => {
      if (state.tracks.some(t => t._id === track._id)) return state;
      return { tracks: [...state.tracks, track] };
    }),

  removeTrack: (trackId) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t._id !== trackId),
    })),

  clearRoom: () => set({ currentRoom: null, members: [], tracks: [], messages: [] }),
}));

export default useRoomStore;
