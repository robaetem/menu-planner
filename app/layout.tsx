import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme";
import { Toaster } from "@/components/ui/sonner";
import { DEV_BYPASS } from "@/lib/supabase/server";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Menu Planner",
  description: "Wekelijkse menu's plannen en recepten beheren — voor Robin & Amber.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#23211f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const inner = (
    <ThemeProvider>
      {children}
      <Toaster position="top-center" />
    </ThemeProvider>
  );
  return (
    <html lang="nl" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {/* In local dev-bypass we skip Clerk entirely (the data layer uses the
            Supabase secret key). In production Clerk wraps the app as usual. */}
        {DEV_BYPASS ? inner : <ClerkProvider>{inner}</ClerkProvider>}
      </body>
    </html>
  );
}
