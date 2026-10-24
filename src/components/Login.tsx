import { FormEvent, useState } from 'react';
import { login } from '../api';

export default function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(pw);
      onDone();
    } catch (ex: any) {
      setErr(ex.message || 'Accesso non riuscito');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big">
          <span className="brand-mark" />
          Partiture per me
        </div>
        <p className="muted">Canovacci e partiture per il live.</p>
        <label className="field">
          <span>Password</span>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary wide" disabled={busy || !pw}>
          {busy ? 'Accesso…' : 'Entra'}
        </button>
      </form>
    </div>
  );
}
