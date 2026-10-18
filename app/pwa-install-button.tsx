"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const subscribeToStandaloneMode = (onChange: () => void) => {
  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  mediaQuery.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);

  return () => {
    mediaQuery.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
};

const getStandaloneMode = () => window.matchMedia("(display-mode: standalone)").matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export default function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const isInstalled = useSyncExternalStore(subscribeToStandaloneMode, getStandaloneMode, () => false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.error("Unable to register the Heartlink service worker:", error);
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const installApp = async () => {
    if (!installPrompt) {
      alert("In Chrome, open the ⋮ menu and choose “Install app” or “Add to Home screen”.");
      return;
    }

    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } catch (error) {
      console.error("Unable to start the Heartlink install prompt:", error);
      alert("Heartlink could not open the install prompt. Try Chrome’s ⋮ menu and choose “Install app”.");
    }
  };

  return (
    <button
      type="button"
      onClick={installApp}
      className="fixed bottom-20 right-4 z-40 rounded-full border border-pink-400/40 bg-[#101625]/95 px-4 py-2.5 text-xs font-bold text-pink-300 shadow-xl backdrop-blur-md transition hover:bg-pink-500/20 focus:outline-none focus:ring-2 focus:ring-pink-400"
      aria-label="Install Heartlink on this device"
    >
      Install Heartlink
    </button>
  );
}
