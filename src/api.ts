// Comunicazione con le funzioni Netlify (con modalità locale di riserva)

import type { Song, SongSummary } from './model';
import { summaryOf } from './model';

const TOKEN_KEY = 'ppm.token';
const LOCAL_KEY = 'ppm.local.songs';
const MODE_KEY = 'ppm.mode';

export class AuthError extends Error {}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function isLocalMode(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) === 'local';
  } catch {
    return false;
  }
}

export function isLoggedIn(): boolean {
  return isLocalMode() || !!getToken();
}

export function logout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(MODE_KEY);
  } catch {
    /* niente */
  }
}

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${getToken() || ''}`,
      ...(init.headers || {}),
    },
  });
  if (res.status === 401) {
    logout();
    throw new AuthError('Sessione scaduta: rientra con la password');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);
  return data;
}

export async function login(password: string): Promise<void> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 404 && location.hostname === 'localhost') {
    // sviluppo senza funzioni: salvataggio nel browser
    localStorage.setItem(MODE_KEY, 'local');
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Accesso non riuscito');
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.removeItem(MODE_KEY);
}

function localAll(): Record<string, Song> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  } catch {
    return {};
  }
}

function localPut(all: Record<string, Song>) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

export async function listSongs(): Promise<SongSummary[]> {
  if (isLocalMode()) return Object.values(localAll()).map(summaryOf);
  const data = await call('/api/songs');
  return (data.songs || []).map((s: any) => ({
    id: s.id,
    title: s.title || '',
    artist: s.artist || '',
    key: s.key || '',
    updatedAt: s.updatedAt || 0,
  }));
}

export async function getSong(id: string): Promise<Song> {
  if (isLocalMode()) {
    const s = localAll()[id];
    if (!s) throw new Error('Brano non trovato');
    return s;
  }
  const data = await call(`/api/songs/${encodeURIComponent(id)}`);
  return data.song;
}

export async function saveSong(song: Song): Promise<void> {
  if (isLocalMode()) {
    const all = localAll();
    all[song.id] = song;
    localPut(all);
    return;
  }
  await call(`/api/songs/${encodeURIComponent(song.id)}`, { method: 'PUT', body: JSON.stringify(song) });
}

export async function deleteSong(id: string): Promise<void> {
  if (isLocalMode()) {
    const all = localAll();
    delete all[id];
    localPut(all);
    return;
  }
  await call(`/api/songs/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// Bozza locale di sicurezza (se la rete cade durante il salvataggio)
const DRAFT_KEY = 'ppm.draft.';

export function saveDraft(song: Song) {
  try {
    localStorage.setItem(DRAFT_KEY + song.id, JSON.stringify(song));
  } catch {
    /* spazio esaurito: pazienza */
  }
}

export function getDraft(id: string): Song | null {
  try {
    const t = localStorage.getItem(DRAFT_KEY + id);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

export function clearDraft(id: string) {
  try {
    localStorage.removeItem(DRAFT_KEY + id);
  } catch {
    /* niente */
  }
}
