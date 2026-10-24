export function toggleTheme() {
  const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = cur;
  try {
    localStorage.setItem('ppm.theme', cur);
  } catch {
    /* niente */
  }
}
