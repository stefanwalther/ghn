"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import * as React from "react";
import { createQueryClient } from "@/lib/queries";
import { applyThemeId, readThemeId } from "@/lib/themes";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => createQueryClient());
  // Color theme (data-theme) is orthogonal to light/dark mode (.dark class
  // owned by next-themes). Re-apply the stored theme on mount so client
  // navigation never drops it.
  React.useEffect(() => {
    applyThemeId(readThemeId());
  }, []);
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
