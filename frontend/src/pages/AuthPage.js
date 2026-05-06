import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// ── Login Form ────────────────────────────────────────────────────────────────
function LoginForm({ onSwitch }) {
  const { login, apiCall } = useAuth();
  const navigate = useNavigate();
  const [form, setForm]     = useState({ email: '', password: '' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      login(data.user, data.token);
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Welcome back</h2>
      <p className="subtitle">Sign in to your MediChat account</p>

      {error && (
        <div className="auth-error">
          <span>⚠️</span> {error}
        </div>
      )}

      <div className="form-group">
        <label>Email address</label>
        <input type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} />
      </div>

      <div className="form-group">
        <label>Password</label>
        <input type="password" placeholder="Enter your password" value={form.password} onChange={set('password')} />
      </div>

      <button className="btn-primary" onClick={submit} disabled={loading}>
        {loading ? '⏳ Signing in...' : '→ Sign in'}
      </button>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.88rem', color: 'var(--gray-400)' }}>
        Don't have an account?{' '}
        <span onClick={onSwitch} style={{ color: 'var(--red)', cursor: 'pointer', fontWeight: 500 }}>
          Create one
        </span>
      </p>
    </div>
  );
}

// ── Signup Form ───────────────────────────────────────────────────────────────
function SignupForm({ onSwitch }) {
  const { login, apiCall } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '', password: '', gender: '', age: '', weight: '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setErrors({ ...errors, [k]: '' });
  };

  const validate = () => {
    const errs = {};
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(form.email))          errs.email    = 'Enter a valid email address';
    if (form.password.length < 6)           errs.password = 'Password must be at least 6 characters';
    if (!form.gender)                       errs.gender   = 'Please select your gender';
    const age = parseInt(form.age);
    if (!form.age || age < 1 || age > 120) errs.age      = 'Enter a valid age (1–120)';
    const wt = parseFloat(form.weight);
    if (!form.weight || wt < 1 || wt > 500) errs.weight  = 'Enter a valid weight in kg';
    return errs;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const data = await apiCall('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email:    form.email,
          password: form.password,
          gender:   form.gender,
          age:      parseInt(form.age),
          weight:   parseFloat(form.weight),
        }),
      });
      login(data.user, data.token);
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const field = (key, label, props) => (
    <div className="form-group">
      <label>{label}</label>
      <input
        {...props}
        value={form[key]}
        onChange={set(key)}
        className={errors[key] ? 'error' : ''}
      />
      {errors[key] && <div className="field-error">{errors[key]}</div>}
    </div>
  );

  return (
    <div className="auth-form">
      <h2>Create account</h2>
      <p className="subtitle">Get personalised medical guidance</p>

      {error && (
        <div className="auth-error">
          <span>⚠️</span> {error}
        </div>
      )}

      <div className="form-section-label">Account</div>

      {field('email', 'Email address', { type: 'email', placeholder: 'you@example.com' })}
      {field('password', 'Password', { type: 'password', placeholder: 'Min. 6 characters' })}
      {errors.password && <p className="form-hint">A stronger password helps protect your health data.</p>}

      <div className="form-section-label">Personal Info</div>
      <p className="form-hint" style={{ marginBottom: 12, marginTop: -4 }}>
        Helps the AI tailor responses to your profile.
      </p>

      <div className="form-group">
        <label>Gender</label>
        <select value={form.gender} onChange={set('gender')} className={errors.gender ? 'error' : ''}>
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="prefer_not_to_say">Prefer not to say</option>
        </select>
        {errors.gender && <div className="field-error">{errors.gender}</div>}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Age (years)</label>
          <input
            type="number" min="1" max="120" placeholder="e.g. 28"
            value={form.age} onChange={set('age')}
            className={errors.age ? 'error' : ''}
          />
          {errors.age && <div className="field-error">{errors.age}</div>}
        </div>
        <div className="form-group">
          <label>Weight (kg)</label>
          <input
            type="number" min="1" max="500" step="0.1" placeholder="e.g. 70"
            value={form.weight} onChange={set('weight')}
            className={errors.weight ? 'error' : ''}
          />
          {errors.weight && <div className="field-error">{errors.weight}</div>}
        </div>
      </div>

      <button className="btn-primary" onClick={submit} disabled={loading}>
        {loading ? '⏳ Creating account...' : '→ Create account'}
      </button>

      <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.88rem', color: 'var(--gray-400)' }}>
        Already have an account?{' '}
        <span onClick={onSwitch} style={{ color: 'var(--red)', cursor: 'pointer', fontWeight: 500 }}>
          Sign in
        </span>
      </p>
    </div>
  );
}

// ── Auth Page ─────────────────────────────────────────────────────────────────
export default function AuthPage() {
  const [tab, setTab] = useState('login');

  return (
    <div className="auth-page">
      {/* Left panel */}
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-logo">
            <div className="logo-icon">🩺</div>
            <span className="logo-text">MediChat AI</span>
          </div>

          <h1>Your personal health companion</h1>
          <p>
            Ask medical questions and get clear, personalised guidance powered by
            AI trained on real doctor–patient consultations.
          </p>
        </div>

        <div className="auth-features">
          <div className="auth-feature">
            <div className="feat-icon">👤</div>
            <span>Personalised to your age, gender & weight</span>
          </div>
          <div className="auth-feature">
            <div className="feat-icon">🔒</div>
            <span>Your health data stays private</span>
          </div>
          <div className="auth-feature">
            <div className="feat-icon">⚡</div>
            <span>Instant responses, anytime</span>
          </div>
          <div className="auth-feature">
            <div className="feat-icon">🏥</div>
            <span>Trained on 50,000 medical consultations</span>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="auth-right">
        <div className="auth-form-wrapper">
          <div className="auth-tabs">
            <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>
              Sign in
            </button>
            <button className={`auth-tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => setTab('signup')}>
              Create account
            </button>
          </div>

          {tab === 'login'
            ? <LoginForm onSwitch={() => setTab('signup')} />
            : <SignupForm onSwitch={() => setTab('login')} />
          }
        </div>
      </div>
    </div>
  );
}
