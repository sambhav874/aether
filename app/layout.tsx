import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import {
  AppearanceProvider,
  APPEARANCE_INIT_SCRIPT,
} from "@/components/providers/appearance-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
});

import { AgentFloatingWidget } from "@/components/ai/agent-floating-widget";

export const metadata: Metadata = {
  title: "Aether",
  description: "Trading operations command center",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/*
          Sets data-density/-motion/-numbers on <html> from localStorage before
          paint, so a compact/reduced-motion user never sees the default theme
          flash first. Must be next/script with an id, not a bare <script> in
          <head>: React never executes script tags it renders on the client,
          which Next 16 now surfaces as a console error. beforeInteractive puts
          it in the server HTML ahead of any Next module.
        */}
        <Script
          id="appearance-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppearanceProvider>
            <TooltipProvider>
              {children}
              <AgentFloatingWidget />
            </TooltipProvider>
          </AppearanceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
