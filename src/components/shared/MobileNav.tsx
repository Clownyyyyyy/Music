"use client";

import { navigate, useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Home, Compass, Library, History, Settings } from "lucide-react";

const NAV = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Compass, label: "Explore", path: "/explore" },
  { icon: Library, label: "Library", path: "/library" },
  { icon: History, label: "History", path: "/history" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function MobileNav() {
  const route = useRoute();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border pb-safe"
      aria-label="Primary mobile"
    >
      <div className="grid grid-cols-5">
        {NAV.map(({ icon: Icon, label, path }) => {
          const p = path === "/" ? "" : path.replace(/^\//, "");
          const active = route.path === p || (p !== "" && route.path.startsWith(`${p}/`));
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold",
                active ? "text-foreground" : "text-muted-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
