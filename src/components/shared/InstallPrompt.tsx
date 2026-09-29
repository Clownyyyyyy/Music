"use client";

/** PWA install prompt (beforeinstallprompt) — "Install PWA" per spec. */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred || hidden) return null;

  return (
    <div className="fixed bottom-32 md:bottom-24 right-4 z-40 max-w-xs rounded-xl border border-border bg-card shadow-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" className="w-8 h-8 rounded-lg bw" />
          <div>
            <div className="text-sm font-extrabold">Install B&amp;W Music</div>
            <div className="text-xs text-muted-foreground">Home-screen app, background audio</div>
          </div>
        </div>
        <button onClick={() => setHidden(true)} aria-label="Dismiss install prompt">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <Button
        className="w-full mt-3 rounded-full"
        onClick={async () => {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice.outcome === "accepted") setHidden(true);
        }}
      >
        <Download className="w-4 h-4 mr-2" /> Install app
      </Button>
    </div>
  );
}
