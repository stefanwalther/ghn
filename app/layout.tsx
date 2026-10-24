import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { THEME_STORAGE_KEY, DEFAULT_THEME_ID } from "@/lib/themes";
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var d=${JSON.stringify(DEFAULT_THEME_ID)};var t=localStorage.getItem(k)||d;if(t&&t!==d)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`,
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
