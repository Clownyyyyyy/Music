"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            // Remounts (view switches, back-navigation) re-serve cached data
            // instantly instead of flashing spinners on every tab change.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
          },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <AppShell />
    </QueryClientProvider>
  );
}
