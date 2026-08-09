import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import AudioPlayer from './AudioPlayer';
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
          <main className={`flex-1 overflow-y-auto relative z-0 ${currentRoom ? 'pb-32' : ''}`}>
            <Outlet />
          </main>
        </div>
      </div>
      {currentRoom && (
        <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-5xl">
            <AudioPlayer />
          </div>
        </div>
      )}
    </div>
  );
}
