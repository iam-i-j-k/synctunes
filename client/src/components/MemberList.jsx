import { Crown, User as UserIcon, UserMinus } from 'lucide-react';
import api from '../api/axios';
import useAuthStore from '../stores/authStore';
import useRoomStore from '../stores/roomStore';

export default function MemberList() {
  const { user } = useAuthStore();
  const { currentRoom, members } = useRoomStore();

  if (!currentRoom) return null;

  const hostId = currentRoom.hostId?.toString() || currentRoom.hostId?._id?.toString();
  const isHost = hostId === user?.id;

  async function handleKick(memberId) {
    try {
      await api.post(`/rooms/${currentRoom._id}/kick`, { memberId });
    } catch (err) {
      console.error('Kick failed:', err);
    }
  }

  return (
    <div className="p-5 flex flex-col h-full bg-black/20">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 px-2">
        Members ({members.length}/20)
      </h3>
      <ul className="flex flex-col gap-2 overflow-y-auto pr-1">
        {members.map((m) => {
          const isThisHost = m.userId === hostId;
          const isMe = m.userId === user?.id;
          return (
            <li key={m.userId} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
              <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(30,215,96,0.8)]" />
              {isThisHost ? <Crown size={16} className="text-primary flex-shrink-0" /> : <UserIcon size={16} className="text-gray-400 flex-shrink-0" />}
              <div className="flex-1 min-w-0 truncate text-sm">
                <strong className="font-semibold text-gray-200">{m.username}</strong>
                {isMe && <small className="text-primary ml-1 font-medium">(you)</small>}
              </div>
              {isThisHost && (
                <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-1 rounded-full uppercase tracking-wider">
                  HOST
                </span>
              )}
              {isHost && !isThisHost && !isMe && (
                <button
                  type="button"
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white/10 rounded-lg transition-all opacity-100 flex-shrink-0"
                  onClick={() => handleKick(m.userId)}
                  title={`Kick ${m.username}`}
                >
                  <UserMinus size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
