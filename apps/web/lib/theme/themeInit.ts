export type ThemeMode = 'light' | 'dark'
export type ThemeSurface = 'public' | 'admin'

export const THEME_STORAGE_KEYS: Record<ThemeSurface, string> = {
  public: 'api-theme-public',
  // v2: admin default flipped to light (day voyage); bump key so prior night preference isn't sticky.
  admin: 'api-theme-admin-v2',
}

export function defaultThemeForSurface(_surface: ThemeSurface): ThemeMode {
  // Day voyage for both public submit and Captain's Deck; users can still toggle night.
  return 'light'
}

/** Inline script string to prevent theme flash before hydration. Safe for server components. */
export function themeInitScript(surface: ThemeSurface): string {
  const key = THEME_STORAGE_KEYS[surface]
  const fallback = defaultThemeForSurface(surface)
  return `(function(){try{var k=${JSON.stringify(key)};var f=${JSON.stringify(fallback)};var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark')t=f;var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.dataset.theme=t;d.dataset.surface=${JSON.stringify(surface)};}catch(e){}})();`
}
