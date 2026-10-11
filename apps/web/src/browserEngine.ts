// User agents describe compatibility too: detect iOS/WebKit before Chromium.
export function browserEngineLabel(userAgent: string): string {
  const webkit = /AppleWebKit\/([\d.]+)/.exec(userAgent);
  if (/iPad|iPhone|iPod/.test(userAgent) && webkit) return `WebKit ${webkit[1]} (версия из User-Agent)`;
  const chromium = /(?:Chrome|Chromium)\/([\d.]+)/.exec(userAgent);
  if (chromium && webkit) return `Blink · Chromium ${chromium[1]}`;
  const gecko = /rv:([\d.]+)\).*Gecko\//.exec(userAgent);
  if (gecko) return `Gecko ${gecko[1]}`;
  if (webkit) return `WebKit ${webkit[1]} (версия из User-Agent)`;
  return 'Движок и версия не определены';
}
