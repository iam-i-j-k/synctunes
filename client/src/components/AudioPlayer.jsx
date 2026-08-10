import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Heart, Music, Shuffle, Repeat, Maximize2, Minimize2, ChevronDown, MoreVertical, Share2, ListMusic, MonitorSpeaker } from 'lucide-react';
import socket from '../socket/socket';
import usePlayerStore from '../stores/playerStore';
import useRoomStore from '../stores/roomStore';
import useAuthStore from '../stores/authStore';
import api from '../api/axios';
import { useDriftCorrection } from '../hooks/useDriftCorrection';
import { toast } from 'react-hot-toast';
import ContextMenu from './ContextMenu';
import AddToPlaylistModal from './AddToPlaylistModal';
import { downloadTrack } from '../utils/downloadTrack';

function formatSec(sec) {
  if (isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Generate a subtle deterministic gradient based on a string
function stringToGradient(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash % 360);
  const h2 = Math.abs((hash * 2) % 360);
  return `linear-gradient(135deg, hsl(${h1}, 70%, 50%), hsl(${h2}, 70%, 30%))`;
}

export default function AudioPlayer() {
  const audioRef = useRef(null);
  const seekingRef = useRef(false);

  const { currentRoom } = useRoomStore();
  const {
    playbackState,
    actionSequence,
    currentTrackId,
    playbackMode,
    applyPlaybackUpdate,
    getAuthorisedPositionMs,
  } = usePlayerStore();

  const tracks = useRoomStore((s) => s.tracks);
  const currentTrack = tracks.find((t) => t._id === currentTrackId) || null;

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('synctunes_volume');
    return saved !== null ? parseFloat(saved) : 1;
  });
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const titleRef = useRef(null);
  const artistRef = useRef(null);
  const [titleMarquee, setTitleMarquee] = useState(false);
  const [artistMarquee, setArtistMarquee] = useState(false);

  useEffect(() => {
    if (isMobileExpanded) {
      // Small timeout to allow the DOM to render the full text before measuring
      setTimeout(() => {
        if (titleRef.current) {
          setTitleMarquee(titleRef.current.scrollWidth > titleRef.current.clientWidth);
        }
        if (artistRef.current) {
          setArtistMarquee(artistRef.current.scrollWidth > artistRef.current.clientWidth);
        }
      }, 100);
    } else {
      setTitleMarquee(false);
      setArtistMarquee(false);
    }
  }, [currentTrack?.title, currentTrack?.artist, isMobileExpanded]);

  const displayDuration = duration || (currentTrack?.durationMs ? currentTrack.durationMs / 1000 : 0);

  const { user, updateUser } = useAuthStore();
  const roomId = currentRoom?._id;

  useDriftCorrection(audioRef, roomId);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const positionMs = getAuthorisedPositionMs();
    const positionSec = positionMs / 1000;

    if (playbackState.isPlaying) {
      // Only seek if metadata is loaded (readyState > 0). Setting currentTime before that causes flickering.
      if (audio.readyState > 0 && Math.abs(audio.currentTime - positionSec) > 0.3) {
        audio.currentTime = positionSec;
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
      if (audio.readyState > 0 && Math.abs(audio.currentTime - positionSec) > 0.3) {
        audio.currentTime = positionSec;
      }
    }
  }, [playbackState, currentTrackId]);

  useEffect(() => {
    function handlePlaybackUpdate({ playbackState: ps, actionSequence: seq, currentTrackId: tid }) {
      applyPlaybackUpdate(ps, seq, tid);
    }

    function handleStaleAction({ currentState, actionSequence: seq }) {
      applyPlaybackUpdate(currentState.playbackState, seq, currentState.currentTrackId);
    }

    socket.on('playback:update', handlePlaybackUpdate);
    socket.on('room:staleAction', handleStaleAction);
    
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      socket.off('playback:update', handlePlaybackUpdate);
      socket.off('room:staleAction', handleStaleAction);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [applyPlaybackUpdate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onTimeUpdate() {
      if (!seekingRef.current) setCurrentTime(audio.currentTime);
    }

    function onLoadedMetadata() {
      if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
      // Apply initial drift correction as soon as metadata loads to prevent start-flicker
      const positionMs = usePlayerStore.getState().getAuthorisedPositionMs();
      const positionSec = positionMs / 1000;
      if (Math.abs(audio.currentTime - positionSec) > 0.3) {
        audio.currentTime = positionSec;
      }
    }

    function onDurationChange() {
      if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    }

    function onVolumeChange() {
      // Do nothing here, we manage volume in react state
    }

    function onEnded() {
      if (!seekingRef.current) {
        socket.emit('playback:next', { roomId, actionSequence });
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('volumechange', onVolumeChange);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('volumechange', onVolumeChange);
      audio.removeEventListener('ended', onEnded);
    };
  }, [roomId, actionSequence]);

  function togglePlay() {
    if (!currentTrack) return;
    if (playbackState.isPlaying) {
      socket.emit('playback:pause', { roomId, actionSequence });
    } else {
      socket.emit('playback:play', { roomId, actionSequence });
    }
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.code === 'Space') {
        const tag = e.target.tagName.toLowerCase();
        // Don't intercept if user is typing in an input or textarea
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
          return;
        }
        e.preventDefault(); // Prevent page scroll
        togglePlay();
      }
    }
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrack, playbackState.isPlaying, roomId, actionSequence]);

  function handleSeekStart(e) {
    seekingRef.current = true;
    setSeeking(true);
    setSeekValue(parseFloat(e.target.value));
  }

  function handleSeekMove(e) {
    setSeekValue(parseFloat(e.target.value));
  }

  function handleSeekEnd(e) {
    seekingRef.current = false;
    setSeeking(false);
    const positionSec = parseFloat(e.target.value);
    setCurrentTime(positionSec);
    socket.emit('playback:seek', {
      roomId,
      actionSequence,
      positionMs: Math.round(positionSec * 1000),
    });
  }

  function handleVolumeChange(e) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    localStorage.setItem('synctunes_volume', v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  function toggleMute() {
    if (volume > 0) {
      setVolume(0);
      localStorage.setItem('synctunes_volume', 0);
      if (audioRef.current) audioRef.current.volume = 0;
    } else {
      setVolume(1);
      localStorage.setItem('synctunes_volume', 1);
      if (audioRef.current) audioRef.current.volume = 1;
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  async function toggleLike() {
    if (!user || !currentTrackId) return;
    try {
      const isLiked = user.likedTracks?.includes(currentTrackId);
      const newLikedTracks = isLiked 
        ? user.likedTracks.filter(id => id !== currentTrackId)
        : [...(user.likedTracks || []), currentTrackId];
      
      updateUser({ likedTracks: newLikedTracks });
      
      const { data } = await api.post(`/users/likes/${currentTrackId}`);
      updateUser({ likedTracks: data.likedTracks });
      
      if (!isLiked) toast.success('Saved to your Liked Songs');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update likes');
    }
  }

  function toggleShuffle() {
    const newMode = playbackMode === 'SHUFFLE' ? 'NORMAL' : 'SHUFFLE';
    socket.emit('playback:mode', { roomId, mode: newMode, actionSequence });
  }

  function toggleRepeat() {
    let newMode = 'NORMAL';
    if (playbackMode === 'NORMAL') newMode = 'REPEAT_ALL';
    else if (playbackMode === 'REPEAT_ALL') newMode = 'REPEAT_ONE';
    else if (playbackMode === 'REPEAT_ONE') newMode = 'NORMAL';
    if (playbackMode === 'SHUFFLE') newMode = 'REPEAT_ALL';
    socket.emit('playback:mode', { roomId, mode: newMode, actionSequence });
  }

  function playNext() {
    socket.emit('playback:next', { roomId, actionSequence });
  }

  function playPrev() {
    socket.emit('playback:prev', { roomId, actionSequence });
  }

  if (!currentTrack) {
    return (
      <div className="h-[90px] w-full flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-2xl">
        <div className="text-gray-400 text-sm font-medium flex items-center gap-3 animate-pulse">
          <Music size={18} />
          Select a track to start listening
        </div>
      </div>
    );
  }

  const currentVal = seeking ? seekValue : currentTime;
  const seekPercentage = displayDuration > 0 ? (currentVal / displayDuration) * 100 : 0;
  const volumePercentage = volume * 100;

  return (
    <>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-50% - 1rem)); }
        }
        .mask-edges {
          mask-image: linear-gradient(to right, transparent 0%, black 5%, black 90%, transparent 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 5%, black 90%, transparent 100%);
        }
      `}</style>
      <audio ref={audioRef} src={currentTrack.cloudinaryUrl} preload="auto" />

      {/* COMPACT / DESKTOP PLAYER */}
      <div 
        className={`h-[64px] md:h-[90px] w-full flex items-center justify-between px-3 md:px-4 bg-zinc-950/90 md:bg-black border border-white/10 md:border-t md:border-white/10 md:border-b-0 md:border-x-0 rounded-xl md:rounded-none shadow-[0_10px_30px_rgba(0,0,0,0.5)] md:shadow-none transition-all ${isMobileExpanded ? 'hidden md:flex' : 'flex'}`}
        onClick={(e) => {
          // Ignore clicks on buttons/inputs
          if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button') || e.target.tagName.toLowerCase() === 'input') {
            return;
          }
          if (window.innerWidth < 768) {
            setIsMobileExpanded(true);
          }
        }}
      >
        {/* LEFT: Art & Info */}
        <div className="flex-1 min-w-0 flex items-center gap-3 md:gap-4 pr-2 md:pr-4 justify-start">
        <div 
          className="w-10 h-10 md:w-14 md:h-14 rounded-lg md:rounded-2xl flex items-center justify-center text-white/80 flex-shrink-0 shadow-[0_4px_15px_rgba(0,0,0,0.5)] relative overflow-hidden group"
          style={currentTrack.albumArtUrl ? { backgroundImage: `url(${currentTrack.albumArtUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: stringToGradient(currentTrack.title) }}
        >
          {playbackState.isPlaying && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-white/30 animate-ping"></div>
            </div>
          )}
          {!currentTrack.albumArtUrl && <Music size={20} className="z-10 drop-shadow-md hidden md:block" />}
          {!currentTrack.albumArtUrl && <Music size={16} className="z-10 drop-shadow-md md:hidden" />}
        </div>
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <div className="text-[13px] md:text-[15px] font-bold text-white truncate hover:underline cursor-pointer tracking-tight" title={currentTrack.title}>{currentTrack.title}</div>
          {currentTrack.artist && <div className="text-[11px] md:text-xs text-gray-400 truncate">{currentTrack.artist}</div>}
        </div>
        
        {/* Desktop Like */}
        <button 
          className={`hidden md:block transition-colors flex-shrink-0 mx-2 hover:scale-110 transform ${user?.likedTracks?.includes(currentTrackId) ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
          onClick={toggleLike}
          aria-label="Save to Your Library"
        >
          <Heart size={18} fill={user?.likedTracks?.includes(currentTrackId) ? 'currentColor' : 'none'} />
        </button>

        {/* Mobile Controls (hidden on md) */}
        <div className="flex items-center gap-3 md:hidden flex-shrink-0">
          <button onClick={toggleLike} className={user?.likedTracks?.includes(currentTrackId) ? 'text-primary' : 'text-gray-400'}>
            <Heart size={16} fill={user?.likedTracks?.includes(currentTrackId) ? 'currentColor' : 'none'} />
          </button>
          <button onClick={togglePlay} className="w-8 h-8 flex items-center justify-center rounded-full bg-white text-black">
            {playbackState.isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
          </button>
          <button onClick={playNext} className="text-gray-400 hover:text-white">
            <SkipForward size={18} fill="currentColor" />
          </button>
        </div>
      </div>

      {/* CENTER: Playback Controls & Slider */}
      <div className="hidden md:flex flex-[2] max-w-[700px] flex-col items-center justify-center px-4">
        <div className="flex items-center gap-6 mb-2">
          <button 
            className={`transition-colors relative ${playbackMode === 'SHUFFLE' ? 'text-primary' : 'text-gray-500 hover:text-white'}`}
            onClick={toggleShuffle} 
            aria-label="Shuffle"
          >
            <Shuffle size={16} />
            {playbackMode === 'SHUFFLE' && <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full"></div>}
          </button>
          
          <button 
            className="text-gray-400 hover:text-white transition-colors hover:scale-110 transform" 
            onClick={playPrev} 
            aria-label="Previous"
          >
            <SkipBack size={20} fill="currentColor" />
          </button>
          
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_rgba(255,255,255,0.5)]"
            onClick={togglePlay}
            aria-label={playbackState.isPlaying ? 'Pause' : 'Play'}
          >
            {playbackState.isPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <button 
            className="text-gray-400 hover:text-white transition-colors hover:scale-110 transform" 
            onClick={playNext} 
            aria-label="Next"
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
          
          <button 
            className={`transition-colors relative ${playbackMode.startsWith('REPEAT') ? 'text-primary' : 'text-gray-500 hover:text-white'}`}
            onClick={toggleRepeat} 
            aria-label="Repeat"
          >
            <Repeat size={16} />
            {playbackMode === 'REPEAT_ONE' && <div className="absolute -top-1 -right-1.5 text-[8px] font-bold text-primary">1</div>}
            {playbackMode.startsWith('REPEAT') && <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full"></div>}
          </button>
        </div>
        <div className="w-full flex items-center gap-3 group">
          <span className="text-[11px] font-medium text-gray-400 w-10 text-right tabular-nums">{formatSec(currentVal)}</span>
          <div className="relative flex-1 h-8 flex items-center cursor-pointer group/slider" style={{ '--progress-pct': `${seekPercentage}%` }}>
            <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full overflow-hidden pointer-events-none">
              <div className="h-full bg-white group-hover/slider:bg-primary transition-colors" style={{ width: `${seekPercentage}%` }} />
            </div>
            {/* Custom thumb on hover */}
            <div 
              className="absolute h-3 w-3 bg-white rounded-full shadow-md opacity-0 group-hover/slider:opacity-100 transition-opacity pointer-events-none -ml-1.5 z-10" 
              style={{ left: `${seekPercentage}%` }}
            />
            <input
              type="range"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              style={{ touchAction: 'none' }}
              min={0}
              max={displayDuration || 1}
              step={0.01}
              value={currentVal}
              onMouseDown={handleSeekStart}
              onChange={handleSeekMove}
              onMouseUp={handleSeekEnd}
              onTouchStart={handleSeekStart}
              onTouchMove={handleSeekMove}
              onTouchEnd={handleSeekEnd}
              aria-label="Seek"
            />
          </div>
          <span className="text-[11px] font-medium text-gray-400 w-10 tabular-nums">{formatSec(displayDuration)}</span>
        </div>
      </div>

      {/* RIGHT: Volume Controls */}
      <div className="flex-1 hidden md:flex justify-end items-center gap-4 min-w-[200px]">
        <button className="text-gray-400 hover:text-white transition-colors" onClick={toggleFullscreen} aria-label="Toggle Fullscreen">
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <div className="flex items-center gap-2">
          <button className="text-gray-400 hover:text-white transition-colors" onClick={toggleMute} aria-label={volume > 0 ? "Mute" : "Unmute"}>
            {volume > 0 ? (
              <Volume2 size={18} />
            ) : (
              <VolumeX size={18} />
            )}
          </button>
          <div className="relative w-[100px] h-8 flex items-center group/vol">
            <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full overflow-hidden pointer-events-none">
              <div className="h-full bg-white group-hover/vol:bg-primary transition-colors" style={{ width: `${volumePercentage}%` }} />
            </div>
            <div 
              className="absolute h-3 w-3 bg-white rounded-full shadow-md opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none -ml-1.5 z-10" 
              style={{ left: `${volumePercentage}%` }}
            />
            <input
              type="range"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              style={{ touchAction: 'none' }}
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={handleVolumeChange}
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>

    {/* FULL-SCREEN MOBILE PLAYER */}
      {isMobileExpanded && (
        <div className="md:hidden fixed inset-0 z-[100] bg-zinc-950 flex flex-col animate-fade-in pointer-events-auto font-sans">
          {/* Full Screen Background (Canvas style) */}
          <div 
            className="absolute inset-0 z-0 bg-cover bg-center opacity-50"
            style={currentTrack.albumArtUrl ? { backgroundImage: `url(${currentTrack.albumArtUrl})` } : { background: stringToGradient(currentTrack.title) }}
          />
          <div className="absolute inset-0 z-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col h-full pt-12 pb-8 px-6">
            {/* Top Bar */}
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setIsMobileExpanded(false)} className="text-white p-2 -ml-2">
                <ChevronDown size={28} />
              </button>
              <div className="flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-widest text-white/70 font-medium mb-0.5">Playing from room</span>
                <span className="text-xs font-bold text-white">{currentRoom?.name || 'SyncTunes Room'}</span>
              </div>
              <button 
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setContextMenu({ x: rect.right - 180, y: rect.bottom + 10, track: currentTrack });
                }} 
                className="text-white p-2 -mr-2"
              >
                <MoreVertical size={24} />
              </button>
            </div>
            
            {/* Flexible Space (Video/Canvas area) */}
            <div className="flex-1 min-h-0 w-full" />

            {/* Bottom Controls Area */}
            <div className="flex flex-col w-full mt-auto">
              {/* Track Info Row */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center flex-1 min-w-0 pr-4">
                  {/* Small Album Art */}
                  <div 
                    className="w-14 h-14 rounded bg-zinc-800 flex-shrink-0 mr-4 shadow-[0_8px_24px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden"
                    style={currentTrack.albumArtUrl ? { backgroundImage: `url(${currentTrack.albumArtUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: stringToGradient(currentTrack.title) }}
                  >
                    {!currentTrack.albumArtUrl && <Music size={24} className="text-white/50" />}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1 overflow-hidden mask-edges relative">
                    <div 
                      ref={titleRef}
                      className={`text-[22px] font-bold text-white tracking-tight leading-tight whitespace-nowrap w-fit ${titleMarquee ? 'animate-[marquee_8s_linear_infinite]' : 'truncate'}`}
                    >
                      {currentTrack.title} {titleMarquee && <span className="ml-8">{currentTrack.title}</span>}
                    </div>
                    <div 
                      ref={artistRef}
                      className={`text-gray-300 text-[15px] mt-0.5 whitespace-nowrap w-fit ${artistMarquee ? 'animate-[marquee_8s_linear_infinite]' : 'truncate'}`}
                    >
                      {currentTrack.artist || 'SyncTunes Room'} {artistMarquee && <span className="ml-8">{currentTrack.artist || 'SyncTunes Room'}</span>}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={toggleLike} 
                  className={`p-2 transition-colors transform hover:scale-110 flex-shrink-0 ${user?.likedTracks?.includes(currentTrackId) ? 'text-primary' : 'text-white'}`}
                >
                  <Heart size={26} fill={user?.likedTracks?.includes(currentTrackId) ? 'currentColor' : 'none'} />
                </button>
              </div>

              {/* Timeline Slider */}
              <div className="mb-2">
                <div className="relative w-full h-6 flex items-center cursor-pointer group/slider" style={{ '--progress-pct': `${seekPercentage}%` }}>
                  <div className="absolute inset-x-0 h-1 bg-white/20 rounded-full overflow-hidden pointer-events-none">
                    <div className="h-full bg-white group-hover/slider:bg-primary transition-colors" style={{ width: `${seekPercentage}%` }} />
                  </div>
                  <div 
                    className="absolute h-3 w-3 bg-white rounded-full shadow-md transition-opacity pointer-events-none -ml-1.5 z-10" 
                    style={{ left: `${seekPercentage}%` }}
                  />
                  <input
                    type="range"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    style={{ touchAction: 'none' }}
                    min={0}
                    max={displayDuration || 1}
                    step={0.01}
                    value={currentVal}
                    onMouseDown={handleSeekStart}
                    onChange={handleSeekMove}
                    onMouseUp={handleSeekEnd}
                    onTouchStart={handleSeekStart}
                    onTouchMove={handleSeekMove}
                    onTouchEnd={handleSeekEnd}
                    aria-label="Seek"
                  />
                </div>
                <div className="flex justify-between text-[12px] text-gray-300 font-medium tabular-nums px-0.5 -mt-1">
                  <span>{formatSec(currentVal)}</span>
                  <span>{formatSec(displayDuration)}</span>
                </div>
              </div>

              {/* Main Controls Row */}
              <div className="flex items-center justify-between px-1 mb-5 mt-2">
                <button 
                  onClick={toggleShuffle} 
                  className={`p-2 transition-colors relative ${playbackMode === 'SHUFFLE' ? 'text-primary' : 'text-white'}`}
                >
                  <Shuffle size={26} />
                  {playbackMode === 'SHUFFLE' && <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full"></div>}
                </button>
                
                <button onClick={playPrev} className="text-white p-2 hover:text-gray-300 transition-colors">
                  <SkipBack size={38} fill="currentColor" />
                </button>
                
                <button 
                  onClick={togglePlay} 
                  className="w-[72px] h-[72px] bg-white rounded-full flex items-center justify-center text-black shadow-xl transform active:scale-95 transition-transform"
                >
                  {playbackState.isPlaying ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" className="ml-1.5" />}
                </button>
                
                <button onClick={playNext} className="text-white p-2 hover:text-gray-300 transition-colors">
                  <SkipForward size={38} fill="currentColor" />
                </button>
                
                <button 
                  onClick={toggleRepeat} 
                  className={`p-2 transition-colors relative ${playbackMode.startsWith('REPEAT') ? 'text-primary' : 'text-white'}`}
                >
                  <Repeat size={26} />
                  {playbackMode === 'REPEAT_ONE' && <div className="absolute -top-1 -right-1 text-[10px] font-bold text-primary bg-black/50 rounded-full px-1">1</div>}
                  {playbackMode.startsWith('REPEAT') && <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full"></div>}
                </button>
              </div>

              {/* Bottom Tools Row */}
              <div className="flex items-center justify-between px-2">
                <button 
                  onClick={() => toast('Listening on Web Browser', { icon: '💻' })} 
                  className="text-white/70 hover:text-white transition-colors p-2 -ml-2"
                >
                  <MonitorSpeaker size={22} />
                </button>
                <div className="flex items-center gap-6 mr-1">
                  <button 
                    onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Room link copied!'); }} 
                    className="text-white/70 hover:text-white transition-colors p-2"
                  >
                    <Share2 size={22} />
                  </button>
                  <button onClick={() => setIsMobileExpanded(false)} className="text-white/70 hover:text-white transition-colors p-2 -mr-2 relative" title="Queue">
                    <ListMusic size={24} />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu 
          x={contextMenu.x} 
          y={contextMenu.y} 
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: 'Add to Playlist',
              icon: <ListMusic size={16} />,
              onClick: () => setShowAddModal(true)
            },
            {
              label: 'Download Song',
              icon: <svg role="img" height="16" width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>,
              onClick: () => downloadTrack(contextMenu.track)
            }
          ]}
        />
      )}

      {showAddModal && (
        <AddToPlaylistModal 
          track={currentTrack} 
          onClose={() => setShowAddModal(false)} 
        />
      )}
    </>
  );
}
