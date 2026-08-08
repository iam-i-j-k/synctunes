import { useRef, useState } from 'react';
import api from '../api/axios';
import useRoomStore from '../stores/roomStore';

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTS = ['.mp3', '.wav', '.m4a'];

export default function TrackUpload() {
  const { currentRoom, addTrack } = useRoomStore();
  const fileRef = useRef(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  // Array of { id, file, title, artist, progress, status: 'pending'|'uploading'|'success'|'error', errorMsg }
  const [uploadItems, setUploadItems] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [globalError, setGlobalError] = useState('');

  if (!currentRoom) return null;

  function closeModal() {
    setIsModalOpen(false);
    setUploadItems([]);
    setGlobalError('');
    setDragActive(false);
  }

  function validateFile(f) {
    if (!f) return { valid: false, error: 'No file' };
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return { valid: false, error: 'Invalid file type' };
    }
    if (f.size > MAX_SIZE) {
      return { valid: false, error: 'File too large (Max 15MB)' };
    }
    return { valid: true };
  }

  function addFiles(newFiles) {
    setGlobalError('');
    const validItems = [];
    let hasError = false;

    Array.from(newFiles).forEach((f) => {
      const { valid, error } = validateFile(f);
      if (valid) {
        const name = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        validItems.push({
          id: Math.random().toString(36).substring(7),
          file: f,
          title: name,
          artist: '',
          progress: 0,
          status: 'pending',
          errorMsg: '',
        });
      } else {
        hasError = true;
        setGlobalError(`Some files were rejected: ${error}`);
      }
    });

    if (validItems.length > 0) {
      setUploadItems((prev) => [...prev, ...validItems]);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFileChange(e) {
    if (e.target.files?.length) {
      addFiles(e.target.files);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }

  function handleZoneClick() {
    if (fileRef.current) fileRef.current.click();
  }

  function updateItem(id, field, value) {
    setUploadItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function removeItem(id) {
    setUploadItems((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleUploadAll(e) {
    e.preventDefault();
    setGlobalError('');

    const pendingItems = uploadItems.filter(item => item.status === 'pending' || item.status === 'error');
    if (pendingItems.length === 0) return;

    // Validate inputs before uploading
    let validationFailed = false;
    pendingItems.forEach(item => {
      if (!item.title.trim() || !item.artist.trim()) {
        updateItem(item.id, 'errorMsg', 'Title and artist are required');
        updateItem(item.id, 'status', 'error');
        validationFailed = true;
      }
    });

    if (validationFailed) return;

    for (const item of pendingItems) {
      updateItem(item.id, 'status', 'uploading');
      updateItem(item.id, 'errorMsg', '');
      updateItem(item.id, 'progress', 0);

      const fd = new FormData();
      fd.append('audio', item.file);
      fd.append('title', item.title.trim());
      fd.append('artist', item.artist.trim());

      try {
        const { data } = await api.post(`/rooms/${currentRoom._id}/tracks`, fd, {
          onUploadProgress: (e) => {
            if (e.total) {
              updateItem(item.id, 'progress', Math.round((e.loaded / e.total) * 100));
            }
          },
        });
        addTrack(data.track);
        updateItem(item.id, 'status', 'success');
      } catch (err) {
        updateItem(item.id, 'status', 'error');
        updateItem(item.id, 'errorMsg', err.response?.data?.message || 'Upload failed');
      }
    }
  }

  const isUploading = uploadItems.some(item => item.status === 'uploading');
  const allSuccess = uploadItems.length > 0 && uploadItems.every(item => item.status === 'success');

  return (
    <div style={{ padding: '0 1.2rem 1rem 1.2rem' }}>
      <button 
        className="btn-ghost" 
        onClick={() => setIsModalOpen(true)}
        style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderStyle: 'dashed' }}
      >
        <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M15.25 8a.75.75 0 0 1-.75.75H8.75v5.75a.75.75 0 0 1-1.5 0V8.75H1.5a.75.75 0 0 1 0-1.5h5.75V1.5a.75.75 0 0 1 1.5 0v5.75h5.75a.75.75 0 0 1 .75.75z"></path>
        </svg>
        Add Track
      </button>

      {isModalOpen && (
        <div className="modal-backdrop" onClick={!isUploading ? closeModal : undefined} style={{ zIndex: 9999 }}>
          <div 
            className="modal-card" 
            style={{ width: '100%', maxWidth: '600px', padding: '1.5rem', background: '#181818', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} 
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexShrink: 0 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text)' }}>
                Add to Playlist
              </h3>
              <button 
                className="btn-ghost" 
                onClick={closeModal}
                style={{ padding: '0.4rem', border: 'none', background: 'transparent', visibility: isUploading ? 'hidden' : 'visible' }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            {uploadItems.length === 0 ? (
              <div 
                className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={handleZoneClick}
                style={{ marginBottom: 0, flex: 1 }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".mp3,.wav,.m4a"
                  onChange={handleFileChange}
                  multiple
                  style={{ display: 'none' }}
                />
                <svg className="upload-icon" role="img" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4 11h-3v5h-2v-5H8l4-4 4 4z"></path>
                </svg>
                <div className="upload-text">Click or drag audio files here</div>
                <div className="upload-hint">Supports multiple MP3, WAV, M4A (Max 15MB each)</div>
              </div>
            ) : (
              <form onSubmit={handleUploadAll} className="upload-form-inputs" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem', flex: 1 }}>
                  {uploadItems.map((item) => (
                    <div key={item.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '1rem', position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', flexShrink: 0 }}>
                          ♪
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.file.name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {(item.file.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                        {item.status !== 'uploading' && item.status !== 'success' && (
                          <button 
                            type="button" 
                            className="btn-ghost btn-small" 
                            onClick={() => removeItem(item.id)}
                            style={{ padding: '0.4rem 0.6rem' }}
                          >
                            Remove
                          </button>
                        )}
                        {item.status === 'success' && (
                          <span style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 600 }}>✓ Done</span>
                        )}
                      </div>

                      <div className="upload-form-row">
                        <input
                          placeholder="Title"
                          value={item.title}
                          onChange={(e) => updateItem(item.id, 'title', e.target.value)}
                          maxLength={100}
                          disabled={item.status === 'uploading' || item.status === 'success'}
                          style={{ borderColor: item.errorMsg ? 'var(--color-danger)' : undefined }}
                        />
                        <input
                          placeholder="Artist"
                          value={item.artist}
                          onChange={(e) => updateItem(item.id, 'artist', e.target.value)}
                          maxLength={100}
                          disabled={item.status === 'uploading' || item.status === 'success'}
                          style={{ borderColor: item.errorMsg ? 'var(--color-danger)' : undefined }}
                        />
                      </div>
                      
                      {item.errorMsg && (
                        <div style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                          {item.errorMsg}
                        </div>
                      )}

                      {item.status === 'uploading' && (
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', marginTop: '1rem' }}>
                          <div style={{ height: '100%', width: `${item.progress}%`, background: 'var(--color-primary)', transition: 'width 0.2s' }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ flexShrink: 0, marginTop: '1rem' }}>
                  {!allSuccess && (
                    <div 
                      className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      onClick={handleZoneClick}
                      style={{ padding: '1rem', borderStyle: 'dashed', background: 'transparent', marginBottom: '1rem' }}
                    >
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".mp3,.wav,.m4a"
                        onChange={handleFileChange}
                        multiple
                        style={{ display: 'none' }}
                      />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>+ Add more files</span>
                    </div>
                  )}

                  <button 
                    type="submit" 
                    className="btn-primary" 
                    disabled={isUploading || uploadItems.every(i => i.status === 'success')} 
                    style={{ padding: '0.8rem', width: '100%' }}
                  >
                    {isUploading ? 'Uploading...' : allSuccess ? 'All Uploads Complete' : 'Upload All Tracks'}
                  </button>
                </div>
              </form>
            )}

            {globalError && <div className="error-text" style={{ marginTop: '1rem', textAlign: 'center', flexShrink: 0 }}>{globalError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
