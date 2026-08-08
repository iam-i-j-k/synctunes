import { useEffect, useRef, useState } from 'react';
import socket from '../socket/socket';
import usePlayerStore from '../stores/playerStore';
import useRoomStore from '../stores/roomStore';
import { useDriftCorrection } from '../hooks/useDriftCorrection';

function formatSec(sec) {
  if (isNaN(sec) || !isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioPlayer() {
  const audioRef = useRef(null);
  const seekingRef = useRef(false);

  const { currentRoom } = useRoomStore();
  const {
    playbackState,
    actionSequence,
    currentTrackId,
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
    return () => {
      socket.off('playback:update', handlePlaybackUpdate);
      socket.off('room:staleAction', handleStaleAction);
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

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('volumechange', onVolumeChange);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

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

  if (!currentTrack) {
    return (
      <div className="player-panel" style={{ justifyContent: 'center' }}>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Select a track to start listening
        </div>
      </div>
    );
  }

  const currentVal = seeking ? seekValue : currentTime;
  const seekPercentage = duration > 0 ? (currentVal / duration) * 100 : 0;
  const volumePercentage = volume * 100;

  return (
    <div className="player-panel">
      <audio ref={audioRef} src={currentTrack.cloudinaryUrl} preload="auto" />

      {/* LEFT: Art & Info */}
      <div className="player-left">
        <div className="player-art-small">
          <svg role="img" height="24" width="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 3h15v15.167a3.5 3.5 0 1 1-3.5-3.5H19V5H8v13.167a3.5 3.5 0 1 1-3.5-3.5H6V3zm0 13.667H4.5a1.5 1.5 0 1 0 1.5 1.5v-1.5zm13-2H17.5a1.5 1.5 0 1 0 1.5 1.5v-1.5z"></path>
          </svg>
        </div>
        <div className="player-info-container">
          <div className="title" title={currentTrack.title}>{currentTrack.title}</div>
          <div className="artist" title={currentTrack.artist}>{currentTrack.artist}</div>
        </div>
        <button className="like-btn" aria-label="Save to Your Library">
          <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.69 2A4.582 4.582 0 0 1 8 2.023 4.583 4.583 0 0 1 11.88.817h.002a4.618 4.618 0 0 1 3.782 3.65v.003a4.543 4.543 0 0 1-1.011 3.84L9.35 14.629a1.765 1.765 0 0 1-2.093.464 1.762 1.762 0 0 1-1.15-1.464l-5.35-6.32a4.541 4.541 0 0 1-1.01-3.84 4.62 4.62 0 0 1 3.783-3.65h.002zM8 3.559a3.082 3.082 0 0 0-4.242 4.22L8 13.064l4.242-5.285A3.082 3.082 0 0 0 8 3.559z"></path>
          </svg>
        </button>
      </div>

      {/* CENTER: Playback Controls & Slider */}
      <div className="player-center">
        <div className="playback-controls">
          <button className="control-btn" aria-label="Previous (dummy)">
            <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.743a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h1.6z"></path>
            </svg>
          </button>
          
          <button
            className="play-btn"
            onClick={togglePlay}
            aria-label={playbackState.isPlaying ? 'Pause' : 'Play'}
          >
            {playbackState.isPlaying ? (
              <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z"></path>
              </svg>
            ) : (
              <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z"></path>
              </svg>
            )}
          </button>

          <button className="control-btn" aria-label="Next (dummy)">
            <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-1.6z"></path>
            </svg>
          </button>
        </div>
        <div className="player-timeline">
          <span className="time-text">{formatSec(currentVal)}</span>
          <div className="progress-bar-container" style={{ '--progress-pct': `${seekPercentage}%` }}>
            <input
              type="range"
              className="styled-slider"
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
          <span className="time-text">{formatSec(duration)}</span>
        </div>
      </div>

      {/* RIGHT: Volume Controls */}
      <div className="player-right">
        <button className="control-btn" onClick={toggleMute} aria-label={volume > 0 ? "Mute" : "Unmute"}>
          {volume > 0 ? (
            <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.741.85a.75.75 0 0 1 .375.65v13a.75.75 0 0 1-1.125.65l-6.925-4a3.642 3.642 0 0 1-1.33-4.967 3.639 3.639 0 0 1 1.33-1.332l6.925-4a.75.75 0 0 1 .75 0zm-6.924 5.3a2.139 2.139 0 0 0 0 3.7l5.8 3.35V2.8l-5.8 3.35zm8.683 4.29V5.56a2.75 2.75 0 0 1 0 4.88z"></path>
              <path d="M11.5 13.614a5.752 5.752 0 0 0 0-11.228v1.55a4.252 4.252 0 0 1 0 8.127v1.55z"></path>
            </svg>
          ) : (
            <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.86 5.47a.75.75 0 0 0-1.061 0l-1.47 1.47-1.47-1.47A.75.75 0 0 0 8.8 6.53L10.269 8l-1.47 1.47a.75.75 0 1 0 1.06 1.06l1.47-1.47 1.47 1.47a.75.75 0 0 0 1.06-1.06L12.39 8l1.47-1.47a.75.75 0 0 0 0-1.06z"></path>
              <path d="M10.116 1.5A.75.75 0 0 0 8.991.85l-6.925 4a3.642 3.642 0 0 0-1.33 4.967 3.639 3.639 0 0 0 1.33 1.332l6.925 4a.75.75 0 0 0 1.125-.65v-13zM2.817 6.15a2.139 2.139 0 0 1 0-3.7l5.8-3.35v13.7l-5.8-3.35z"></path>
            </svg>
          )}
        </button>
        <div className="progress-bar-container volume-bar" style={{ '--progress-pct': `${volumePercentage}%` }}>
          <input
            type="range"
            className="styled-slider"
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
  );
}
