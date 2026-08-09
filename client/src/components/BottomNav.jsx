import { NavLink } from 'react-router-dom';
import { Home, Heart, ListMusic } from 'lucide-react';

export default function BottomNav() {
  const activeLinkClass = "text-primary";
  const inactiveLinkClass = "text-gray-400 hover:text-white";

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950 border-t border-white/5 flex items-center justify-around z-40 pb-safe">
      <NavLink to="/" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1 ${isActive ? activeLinkClass : inactiveLinkClass}`} end>
        <Home size={24} />
        <span className="text-[10px] font-medium">Home</span>
      </NavLink>

      <NavLink to="/library/likes" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1 ${isActive ? activeLinkClass : inactiveLinkClass}`}>
        <Heart size={24} />
        <span className="text-[10px] font-medium">Likes</span>
      </NavLink>

      <NavLink to="/library/playlists" className={({ isActive }) => `flex flex-col items-center justify-center w-full h-full gap-1 ${isActive ? activeLinkClass : inactiveLinkClass}`}>
        <ListMusic size={24} />
        <span className="text-[10px] font-medium">Playlists</span>
      </NavLink>
    </nav>
  );
}
