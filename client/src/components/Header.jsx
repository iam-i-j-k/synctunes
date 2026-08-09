import { Search, Bell, User, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import { disconnectSocket } from '../socket/socket';

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    disconnectSocket();
    logout();
    navigate('/login');
  }

  return (
    <header className="h-16 flex items-center justify-between px-3 md:px-6 bg-zinc-950/50 backdrop-blur-md border-b border-white/5 z-10 sticky top-0">
      <div className="hidden md:flex items-center bg-white/5 rounded-full px-4 py-2 w-full max-w-sm border border-white/5 focus-within:border-primary/50 focus-within:bg-white/10 transition-colors">
        <Search size={18} className="text-gray-400 mr-2" />
        <input type="text" placeholder="Search for rooms or tracks..." className="bg-transparent border-none text-white text-sm w-full outline-none placeholder:text-gray-500" />
      </div>

      <div className="flex items-center gap-2 md:gap-4 ml-auto">
        <button className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors" title="Notifications">
          <Bell size={20} />
        </button>
        <div className="flex items-center gap-3 bg-white/5 rounded-full p-1 pr-4 border border-white/5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-green-700 flex items-center justify-center text-white shadow-inner flex-shrink-0">
            <User size={18} />
          </div>
          <span className="hidden sm:block text-sm font-semibold text-white truncate max-w-[100px]">{user?.username}</span>
          <button className="text-gray-400 hover:text-red-500 transition-colors ml-1 md:ml-2" onClick={handleLogout} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
