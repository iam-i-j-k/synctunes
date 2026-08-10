import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import AudioPlayer from './AudioPlayer';
import BottomNav from './BottomNav';
import useRoomStore from '../stores/roomStore';
import { useRoomConnection } from '../hooks/useRoomConnection';

export default function Layout() {
  const { currentRoom } = useRoomStore();
  useRoomConnection();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-950 text-gray-100">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-green-500/10 to-zinc-950 md:rounded-tl-lg overflow-hidden animate-main-gradient bg-[length:100%_400%]">
          <Header />
          <main className={`flex-1 flex flex-col overflow-hidden relative z-0 ${currentRoom ? 'pb-[140px] md:pb-[90px]' : 'pb-[80px] md:pb-0'}`}>
            <Outlet />
          </main>
        </div>
      </div>
      {currentRoom && (
        <div className="fixed bottom-[64px] md:bottom-0 left-0 right-0 z-50 w-full px-2 md:px-0 pb-2 md:pb-0 pointer-events-none md:pointer-events-auto">
          <div className="w-full pointer-events-auto">
            <AudioPlayer />
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
