import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import useAuthStore from '../stores/authStore';
import { connectSocket } from '../socket/socket';

export default function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setFieldErrors((fe) => ({ ...fe, [e.target.name]: '' }));
    setError('');
  }

  function validate() {
    const errors = {};
    if (!form.username || form.username.length < 3)
      errors.username = 'Username must be at least 3 characters';
    if (!form.email) errors.email = 'Email is required';
    if (!form.password || form.password.length < 8)
      errors.password = 'Password must be at least 8 characters';
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/register', form);
      login(data.user, data.token);
      connectSocket(data.token);
      navigate('/');
    } catch (err) {
      const apiErr = err.response?.data;
      if (apiErr?.field) {
        setFieldErrors({ [apiErr.field]: apiErr.message });
      } else {
        setError(apiErr?.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ marginBottom: '1.5rem', fontSize: '1.6rem' }}>
          🎵 SyncTunes
        </h1>
        <h2 style={{ marginBottom: '1.25rem', fontSize: '1.1rem', color: 'var(--color-text-muted)' }}>
          Create an account
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={form.username}
              onChange={handleChange}
            />
            {fieldErrors.username && <span className="error-text">{fieldErrors.username}</span>}
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={handleChange}
            />
            {fieldErrors.email && <span className="error-text">{fieldErrors.email}</span>}
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={handleChange}
            />
            {fieldErrors.password && <span className="error-text">{fieldErrors.password}</span>}
          </div>
          {error && <p className="error-text" style={{ marginBottom: '0.75rem' }}>{error}</p>}
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '0.65rem' }}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
