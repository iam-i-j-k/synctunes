import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, UploadCloud, X, Music, Check } from 'lucide-react';
import api from '../api/axios';
import useRoomStore from '../stores/roomStore';

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTS = ['.mp3', '.wav', '.m4a'];

export default function TrackUpload() {
  const { currentRoom, addTrack } = useRoomStore();
  const fileRef = useRef(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  // Array of { id, file, title, progress, status: 'pending'|'uploading'|'success'|'error', errorMsg }
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
      if (!item.title.trim()) {
        updateItem(item.id, 'errorMsg', 'Title is required');
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
    <div className="px-4 py-4 md:px-6">
      <button 
        className="px-6 py-3 bg-white hover:bg-gray-200 text-black font-bold rounded-full flex items-center justify-center gap-2 transition-transform hover:scale-105 shadow-[0_8px_16px_rgba(255,255,255,0.1)] w-full md:w-auto" 
        onClick={() => setIsModalOpen(true)}
      >
        <Plus size={20} className="text-black" />
        <span>Add to Queue</span>
      </button>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={!isUploading ? closeModal : undefined}>
          <div 
            className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col max-h-[90vh] shadow-2xl" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5 flex-shrink-0">
              <h3 className="text-xl font-bold text-white">
                Add to Playlist
              </h3>
              <button 
                className={`p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors ${isUploading ? 'invisible' : 'visible'}`} 
                onClick={closeModal}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            
            {uploadItems.length === 0 ? (
              <div 
                className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl transition-all cursor-pointer flex-1 ${dragActive ? 'border-primary bg-primary/5' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={handleZoneClick}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".mp3,.wav,.m4a"
                  onChange={handleFileChange}
                  multiple
                  className="hidden"
                />
                <UploadCloud size={48} className="text-primary mb-4" />
                <div className="text-lg font-semibold text-white mb-2">Click or drag audio files here</div>
                <div className="text-sm text-gray-400">Supports multiple MP3, WAV, M4A (Max 15MB each)</div>
              </div>
            ) : (
              <form onSubmit={handleUploadAll} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex flex-col gap-4 overflow-y-auto pr-2 flex-1 custom-scrollbar">
                  {uploadItems.map((item) => (
                    <div key={item.id} className="bg-white/[0.04] rounded-xl p-4 relative border border-white/5">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
                          <Music size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white truncate">
                            {item.file.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {(item.file.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                        {item.status !== 'uploading' && item.status !== 'success' && (
                          <button 
                            type="button" 
                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-sm font-semibold transition-colors border border-red-500/20" 
                            onClick={() => removeItem(item.id)}
                          >
                            Remove
                          </button>
                        )}
                        {item.status === 'success' && (
                          <span className="flex items-center gap-1 text-primary text-sm font-bold">
                            <Check size={16} /> Done
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <input
                          placeholder="Title"
                          value={item.title}
                          onChange={(e) => updateItem(item.id, 'title', e.target.value)}
                          maxLength={100}
                          disabled={item.status === 'uploading' || item.status === 'success'}
                          className={`w-full px-3 py-2 bg-black/20 border ${item.errorMsg ? 'border-red-500' : 'border-white/10'} rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 disabled:opacity-50 transition-colors`}
                        />
                      </div>
                      
                      {item.errorMsg && (
                        <div className="text-red-500 text-xs mt-2">
                          {item.errorMsg}
                        </div>
                      )}

                      {item.status === 'uploading' && (
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-4">
                          <div className="h-full bg-primary transition-all duration-200" style={{ width: `${item.progress}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex-shrink-0 mt-4 border-t border-white/10 pt-4">
                  {!allSuccess && (
                    <div 
                      className={`flex items-center justify-center p-3 mb-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${dragActive ? 'border-primary bg-primary/5' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                      onClick={handleZoneClick}
                    >
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".mp3,.wav,.m4a"
                        onChange={handleFileChange}
                        multiple
                        className="hidden"
                      />
                      <span className="text-gray-400 text-sm font-medium">+ Add more files</span>
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={isUploading || uploadItems.every(i => i.status === 'success')} 
                    className="w-full py-3.5 bg-gradient-to-br from-primary to-green-600 hover:from-primary-hover hover:to-green-500 text-white font-semibold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isUploading ? 'Uploading...' : allSuccess ? 'All Uploads Complete' : 'Upload All Tracks'}
                  </button>
                </div>
              </form>
            )}

            {globalError && <div className="text-red-500 text-center mt-4 text-sm font-medium flex-shrink-0">{globalError}</div>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
