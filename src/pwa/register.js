export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // The app remains usable without the optional offline shell.
      });
    },
    { once: true },
  );
}
