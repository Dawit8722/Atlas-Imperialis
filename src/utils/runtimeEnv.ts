export function isElectronDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.desktopAPI?.isElectron);
}
