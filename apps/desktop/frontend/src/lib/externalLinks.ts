export function openExternalURL(url: string) {
  if (window.runtime?.BrowserOpenURL) {
    window.runtime.BrowserOpenURL(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
