import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  // Dynamically import to avoid circular deps — read directly from storage
  const raw = localStorage.getItem('synctunes-auth');
  if (raw) {
    try {
      const { state } = JSON.parse(raw);
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    } catch {
      // ignore malformed storage
    }
  }
  return config;
});

// On 401, clear auth and redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('synctunes-auth');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
