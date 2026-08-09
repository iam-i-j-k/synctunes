import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Heart, Music, Shuffle, Repeat, Maximize2, Minimize2 } from 'lucide-react';
import socket from '../socket/socket';
import usePlayerStore from '../stores/playerStore';
import useRoomStore from '../stores/roomStore';
import useAuthStore from '../stores/authStore';
import api from '../api/axios';
import { useDriftCorrection } from '../hooks/useDriftCorrection';

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
  const [volume, setVolume] = useState(1);
  const [seeking, setSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { user, updateUser } = useAuthStore();
  const roomId = currentRoom?._id;

  useDriftCorrection(audioRef, roomId);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const positionMs = getAuthorisedPositionMs();
    const positionSec = positionMs / 1000;

    if (playbackState.isPlaying) {
      if (Math.abs(audio.currentTime - positionSec) > 0.3) {
        audio.currentTime = positionSec;
      }
      audio.play().catch(() => {});
    } else {
      audio.pause();
      if (Math.abs(audio.currentTime - positionSec) > 0.3) {
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
    }

    function onDurationChange() {
      if (audio.duration && audio.duration !== Infinity && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    }

    function onVolumeChange() {
      setVolume(audio.volume);
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
    if (audioRef.current) audioRef.current.volume = v;
  }

  function toggleMute() {
    if (volume > 0) {
      setVolume(0);
      if (audioRef.current) audioRef.current.volume = 0;
    } else {
      setVolume(1);
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
    } catch (err) {
      console.error(err);
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
  const seekPercentage = duration > 0 ? (currentVal / duration) * 100 : 0;
  const volumePercentage = volume * 100;

  return (
    <div className="h-[64px] md:h-[96px] w-full flex items-center justify-between px-3 md:px-6 bg-zinc-950/90 md:bg-zinc-950/80 backdrop-blur-3xl border border-white/10 rounded-xl md:rounded-[2.5rem] shadow-[0_10px_30px_rgba(0,0,0,0.5)] md:shadow-[0_20px_40px_rgba(0,0,0,0.5)] transition-all">
      <audio ref={audioRef} src={currentTrack.cloudinaryUrl} preload="auto" />

      {/* LEFT: Art & Info */}
      <div className="flex-1 min-w-0 flex items-center gap-3 md:gap-4 pr-2 md:pr-4 justify-start">
        <div 
          className="w-10 h-10 md:w-14 md:h-14 rounded-lg md:rounded-2xl flex items-center justify-center text-white/80 flex-shrink-0 shadow-[0_4px_15px_rgba(0,0,0,0.5)] relative overflow-hidden group"
          style={{ background: stringToGradient(currentTrack.title) }}
        >
          {playbackState.isPlaying && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-white/30 animate-ping"></div>
            </div>
          )}
          <Music size={20} className="z-10 drop-shadow-md hidden md:block" />
          <Music size={16} className="z-10 drop-shadow-md md:hidden" />
        </div>
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <div className="text-[13px] md:text-[15px] font-bold text-white truncate hover:underline cursor-pointer tracking-tight" title={currentTrack.title}>{currentTrack.title}</div>
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
          <div className="relative flex-1 h-4 flex items-center cursor-pointer group/slider" style={{ '--progress-pct': `${seekPercentage}%` }}>
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
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              min={0}
              max={duration || 1}
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
          <span className="text-[11px] font-medium text-gray-400 w-10 tabular-nums">{formatSec(duration)}</span>
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
          <div className="relative w-[100px] h-4 flex items-center group/vol">
            <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full overflow-hidden pointer-events-none">
              <div className="h-full bg-white group-hover/vol:bg-primary transition-colors" style={{ width: `${volumePercentage}%` }} />
            </div>
            <div 
              className="absolute h-3 w-3 bg-white rounded-full shadow-md opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none -ml-1.5 z-10" 
              style={{ left: `${volumePercentage}%` }}
            />
            <input
              type="range"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
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
  );
}
