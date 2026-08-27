import { NavLink } from 'react-router-dom';
import { Home, Heart, Library as LibraryIcon, ListMusic, Search } from 'lucide-react';

export default function Sidebar() {
  const navLinkClass = "flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 font-medium transition-all duration-200 hover:bg-white/5 hover:text-white mb-1 w-full text-left";
  const activeLinkClass = "bg-white/10 text-primary font-semibold shadow-[0_0_15px_rgba(30,215,96,0.1)]";

  return (
    <aside className="hidden md:flex flex-col w-[260px] bg-zinc-950 p-5 flex-shrink-0 z-10 border-r border-white/5">
      <div className="flex items-center mb-8 px-2">
        <img src="/logo.png" alt="SyncTunes Logo" className="w-8 h-8 mr-3 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.5)]" />
        <span className="font-extrabold text-xl tracking-tight text-white">SyncTunes</span>
      </div>

      <nav className="flex flex-col gap-6 overflow-y-auto pr-2">
        <div className="flex flex-col">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-4">Menu</h4>
          <NavLink to="/" className={({ isActive }) => `${navLinkClass} ${isActive ? activeLinkClass : ''}`} end>
            {({ isActive }) => (
              <>
                <Home size={20} className={isActive ? 'text-primary' : ''} />
                <span>Home</span>
              </>
            )}
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => `${navLinkClass} ${isActive ? activeLinkClass : ''}`}>
            {({ isActive }) => (
              <>
                <Search size={20} className={isActive ? 'text-primary' : ''} />
                <span>Search</span>
              </>
            )}
          </NavLink>
        </div>

        <div className="flex flex-col mt-4">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-4">Your Library</h4>
          
          <NavLink to="/library/likes" className={({ isActive }) => `${navLinkClass} ${isActive ? activeLinkClass : ''}`}>
            {({ isActive }) => (
              <>
                <div className={`p-1 rounded bg-gradient-to-br from-indigo-500 to-purple-500 shadow-md flex items-center justify-center ${isActive ? 'shadow-purple-500/30' : ''}`}>
                  <Heart size={14} fill="white" className="text-white" />
                </div>
                <span>Liked Songs</span>
              </>
            )}
          </NavLink>
          
          <NavLink to="/library/playlists" className={({ isActive }) => `${navLinkClass} ${isActive ? activeLinkClass : ''}`}>
            {({ isActive }) => (
              <>
                <ListMusic size={20} className={isActive ? 'text-primary' : ''} />
                <span>Playlists</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}
