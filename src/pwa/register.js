export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // The app remains usable without the optional offline shell.
      });
    },
    { once: true },
  );
}
