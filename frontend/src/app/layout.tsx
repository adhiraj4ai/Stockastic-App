import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stockastic",
  description: "Stock Market Intelligence",
};

import { TooltipProvider } from "@/components/ui/tooltip";
import IdleSessionProvider from "@/components/IdleSessionProvider";
import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="font-sans bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <IdleSessionProvider>
            <TooltipProvider>
              {children}
            </TooltipProvider>
          </IdleSessionProvider>
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            duration={6000}
            toastOptions={{
              classNames: {
                toast: 'font-sans text-sm',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
