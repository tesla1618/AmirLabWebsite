"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ButtonControl } from "@/components/ui/button-control";
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
interface PwaState {
  unavailable: boolean;
  registration: ServiceWorkerRegistration | null;
  install: (() => Promise<void>) | null;
}
const PwaContext = createContext<PwaState>({
  unavailable: false,
  registration: null,
  install: null,
});
export function usePwa() {
  return useContext(PwaContext);
}
export function PwaProvider({ children }: { children: ReactNode }) {
  const requestedUpdate = useRef(false);
  const [unavailable, setUnavailable] = useState(false);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let cleanup = () => {};
    const onInstall = (event: Event) => {
      if (!("prompt" in event) || !("userChoice" in event)) return;
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    const onController = () => {
      if (requestedUpdate.current) window.location.reload();
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    void navigator.serviceWorker
      .register("/push-worker.js", { scope: "/", updateViaCache: "none" })
      .then((worker) => {
        if (!active) return;
        setRegistration(worker);
        setWaiting(worker.waiting);
        const onUpdate = () => {
          const installing = worker.installing;
          if (!installing) return;
          const onState = () => {
            if (
              active &&
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setWaiting(worker.waiting);
          };
          installing.addEventListener("statechange", onState);
        };
        worker.addEventListener("updatefound", onUpdate);
        onUpdate();
        cleanup = () => {
          worker.removeEventListener("updatefound", onUpdate);
        };
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => {
      active = false;
      cleanup();
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onController,
      );
    };
  }, []);
  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }
  return (
    <PwaContext.Provider
      value={{
        unavailable,
        registration,
        install: installEvent ? install : null,
      }}
    >
      {children}
      {waiting ? (
        <aside
          aria-label="App update"
          className="fixed right-4 bottom-4 z-50 grid max-w-sm gap-3 border border-line-strong bg-surface p-4 shadow-lg"
        >
          <p className="text-sm">
            An AmirLab update is ready. Save your work before reloading.
          </p>
          <div className="flex gap-2">
            <ButtonControl
              variant="primary"
              onClick={() => {
                requestedUpdate.current = true;
                waiting.postMessage({ type: "SKIP_WAITING" });
              }}
            >
              Reload to update
            </ButtonControl>
            <ButtonControl onClick={() => setWaiting(null)}>
              Later
            </ButtonControl>
          </div>
        </aside>
      ) : null}
    </PwaContext.Provider>
  );
}
