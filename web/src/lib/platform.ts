export interface PlatformInfo {
  ios: boolean;
  android: boolean;
  /** Launched from the home screen (installed PWA). */
  standalone: boolean;
  displayMode: string;
}

export function detectPlatform(nav: Navigator = navigator, win: Window = window): PlatformInfo {
  const ua = nav.userAgent;
  // iPadOS reports itself as Mac; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'browser'];
  const displayMode = modes.find((m) => win.matchMedia?.(`(display-mode: ${m})`).matches) ?? 'browser';
  const iosStandalone = (nav as Navigator & { standalone?: boolean }).standalone === true;
  return { ios, android, standalone: iosStandalone || displayMode === 'standalone', displayMode };
}
