import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";
import { HudNav } from "@/components/ui/HudNav";
import { HarmonixSplash } from "@/components/ui/HarmonixLogo";
import { ThemeProvider } from "@/components/theme-provider";
import { AutopilotProvider } from "@/context/autopilot";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "HARMONIX-AR | Acoustic Chladni Resonance & NDT Inspection",
  description: "Next-Generation Augmented Reality Chladni Resonance & Nondestructive Testing Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${jetbrainsMono.variable} ${inter.variable} min-h-screen bg-slate-50 dark:bg-[#0D191C] text-slate-900 dark:text-[#F5FDFF] flex justify-center transition-colors duration-200`}
      >
        <ThemeProvider defaultTheme="light" attribute="class" enableSystem={false}>
          <HarmonixSplash />
          <div className="w-full max-w-[440px] min-h-screen bg-white dark:bg-[#0D191C] border-x border-slate-200 dark:border-[#294044]/50 flex flex-col relative shadow-xl">
            <AutopilotProvider>
              <main className="flex-1 pb-20">{children}</main>
              <HudNav />
            </AutopilotProvider>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
