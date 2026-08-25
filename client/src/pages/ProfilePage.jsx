import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Heart, Music, ListMusic, Home, Calendar, ArrowLeft, LogOut, Settings } from 'lucide-react';
import api from '../api/axios';
import useAuthStore from '../stores/authStore';
import { disconnectSocket } from '../socket/socket';

function StatCard({ icon, label, value, color }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 flex flex-col items-center gap-2 hover:bg-white/[0.06] transition-colors">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div className="text-2xl font-extrabold text-white">{value}</div>
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentTracks, setRecentTracks] = useState([]);

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true);
      try {
        const [profileRes, recentRes] = await Promise.all([
          api.get('/users/profile'),
          api.get('/users/recently-played'),
        ]);
        setProfile(profileRes.data.profile);
        setRecentTracks(recentRes.data.tracks || []);
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  function handleLogout() {
    disconnectSocket();
    logout();
    navigate('/login');
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Profile Header */}
      <div className="relative px-4 md:px-10 py-8 md:py-14 bg-gradient-to-b from-emerald-900/40 to-zinc-900">
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 p-2 bg-black/30 hover:bg-black/50 rounded-full transition-colors text-white"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex flex-col items-center gap-4">
          <div className="w-28 h-28 md:w-36 md:h-36 rounded-full bg-gradient-to-br from-primary to-green-700 flex items-center justify-center shadow-2xl ring-4 ring-primary/20">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <User size={56} className="text-white" />
            )}
          </div>
          <div className="text-center">
            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">{profile?.username}</h1>
            <p className="text-sm text-gray-400 mt-1">{profile?.email}</p>
            <div className="flex items-center gap-2 justify-center mt-2 text-xs text-gray-500">
              <Calendar size={12} />
              <span>Joined {new Date(profile?.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="px-4 md:px-10 py-6">
        <h2 className="text-lg font-bold text-white mb-4">Your Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            icon={<Heart size={24} fill="white" className="text-white" />}
            label="Liked Songs"
            value={profile?.likedCount || 0}
            color="bg-gradient-to-br from-pink-500 to-rose-600"
          />
          <StatCard
            icon={<Home size={24} className="text-white" />}
            label="Rooms Joined"
            value={profile?.roomsJoined || 0}
            color="bg-gradient-to-br from-blue-500 to-indigo-600"
          />
          <StatCard
            icon={<Music size={24} className="text-white" />}
            label="Tracks Uploaded"
            value={profile?.tracksUploaded || 0}
            color="bg-gradient-to-br from-emerald-500 to-green-600"
          />
          <StatCard
            icon={<ListMusic size={24} className="text-white" />}
            label="Playlists"
            value={profile?.playlistCount || 0}
            color="bg-gradient-to-br from-amber-500 to-orange-600"
          />
        </div>
      </div>

      {/* Recently Played */}
      <div className="px-4 md:px-10 py-6">
        <h2 className="text-lg font-bold text-white mb-4">Recently Played</h2>
        {recentTracks.length === 0 ? (
          <div className="py-12 text-center text-gray-400 bg-white/[0.02] rounded-2xl border border-white/5">
            <Music size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No recently played tracks</p>
            <p className="text-xs text-gray-500 mt-1">Your listening history will appear here</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {recentTracks.map((track, i) => (
              <div
                key={track._id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="w-8 text-right text-gray-500 text-sm">{i + 1}</div>
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex-shrink-0 overflow-hidden shadow-md">
                  {track.albumArtUrl ? (
                    <img src={track.albumArtUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={16} className="text-gray-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{track.title}</div>
                  {track.artist && <div className="text-xs text-gray-400 truncate">{track.artist}</div>}
                </div>
                {track.fromRoom && (
                  <div className="text-[10px] text-gray-500 bg-white/5 px-2 py-1 rounded-full flex-shrink-0 hidden md:block">
                    {track.fromRoom.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 md:px-10 py-6 pb-24">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 font-semibold transition-colors"
        >
          <LogOut size={20} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
