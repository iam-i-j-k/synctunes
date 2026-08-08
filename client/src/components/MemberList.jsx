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
    <div className="member-sidebar">
      <h3 style={{ fontSize: '0.86rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
        Members ({members.length}/20)
      </h3>
      <ul className="member-list">
        {members.map((m) => {
          const isThisHost = m.userId === hostId;
          const isMe = m.userId === user?.id;
          return (
            <li key={m.userId} className="member-item">
              <span className="status-dot" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{m.username}</strong>
                {isMe && <small> (you)</small>}
              </div>
              {isThisHost && (
                <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                  HOST
                </span>
              )}
              {isHost && !isThisHost && !isMe && (
                <button
                  type="button"
                  className="btn-danger btn-small"
                  onClick={() => handleKick(m.userId)}
                  title={`Kick ${m.username}`}
                >
                  Kick
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
