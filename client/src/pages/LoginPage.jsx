import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import api from '../api/axios';
import useAuthStore from '../stores/authStore';
import { connectSocket } from '../socket/socket';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', form);
      login(data.user, data.token);
      connectSocket(data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/google', { credential: credentialResponse.credential });
      login(data.user, data.token);
      connectSocket(data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Google login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full min-h-screen">
      <div className="hidden lg:flex flex-1 relative items-center justify-center p-16 bg-gradient-to-br from-green-500/10 to-black/90 border-r border-white/5 bg-[url('https://images.unsplash.com/photo-1614149162883-504ce4d13909?q=80&w=1000&auto=format&fit=crop')] bg-center bg-cover">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
        <div className="relative z-10 text-center flex flex-col items-center">
          <img src="/logo.png" alt="SyncTunes Logo" className="w-24 h-24 mb-6 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]" />
          <h1 className="text-5xl font-extrabold mb-4 tracking-tight">SyncTunes</h1>
          <p className="text-xl text-white/80 max-w-md mx-auto leading-relaxed">Listen together, perfectly in sync. Join the ultimate shared music experience.</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-zinc-950 overflow-y-auto">
        <div className="w-full max-w-md bg-white/[0.02] border border-white/5 rounded-2xl p-10 sm:p-12 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl m-auto">
          <h2 className="mb-2 text-3xl font-bold">Welcome back</h2>
          <p className="mb-8 text-base text-gray-400">
            Sign in to continue to your account
          </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-gray-300">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium text-gray-300">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={handleChange}
              className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-2 bg-gradient-to-br from-primary to-green-600 hover:from-primary-hover hover:to-green-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transform hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="flex items-center my-6">
          <hr className="flex-1 border-white/10" />
          <span className="px-3 text-sm text-gray-500">OR</span>
          <hr className="flex-1 border-white/10" />
        </div>

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google login was unsuccessful')}
            useOneTap
            theme="filled_black"
            shape="rectangular"
            text="continue_with"
          />
        </div>

        <p className="mt-8 text-center text-sm text-gray-400">
          Don't have an account?{' '}
          <Link to="/register" className="font-semibold text-primary hover:text-primary-hover transition-colors">Create one</Link>
        </p>
        </div>
      </div>
    </div>
  );
}
