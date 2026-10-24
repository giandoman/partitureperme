import { useEffect, useState } from 'react';
import { isLoggedIn } from './api';
import Editor from './components/Editor';
import Library from './components/Library';
import Login from './components/Login';

function useHash(): string {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

export function go(path: string) {
  location.hash = path;
}

export default function App() {
  const hash = useHash();
  const [logged, setLogged] = useState(isLoggedIn());

  useEffect(() => {
    const f = () => setLogged(isLoggedIn());
    window.addEventListener('ppm-auth', f);
    return () => window.removeEventListener('ppm-auth', f);
  }, []);

  if (!logged) return <Login onDone={() => setLogged(true)} />;
  const m = /^#\/brano\/([\w-]+)/.exec(hash);
  if (m) return <Editor key={m[1]} id={m[1]} />;
  return <Library />;
}
