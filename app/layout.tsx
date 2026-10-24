import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ghn - The better github notifications",
  description: "GitHub-style inbox with fewer clicks and per-repo digests",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Static inline script on purpose: it must run before paint to avoid a
          theme flash, and keeping it a string literal (no interpolation) keeps
          it out of CodeQL's code-construction taint. Values mirror
          THEME_STORAGE_KEY / DEFAULT_THEME_ID in lib/themes.ts and are pinned
          by tests/unit/theme-init.test.ts - update both together.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="ghn:theme";var d="default";var t=localStorage.getItem(k)||d;if(t&&t!==d)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
