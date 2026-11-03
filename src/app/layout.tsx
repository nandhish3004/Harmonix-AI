import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import "./globals.css";
import { HudNav } from "@/components/ui/HudNav";

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
    <html lang="en" className="dark">
      <body
        className={`${jetbrainsMono.variable} ${inter.variable} min-h-screen bg-[#0D191C] text-[#F5FDFF] flex justify-center`}
      >
        <div className="w-full max-w-[440px] min-h-screen bg-[#0D191C] border-x border-[#294044]/50 flex flex-col relative shadow-2xl">
          <main className="flex-1 pb-16">{children}</main>
          <HudNav />
        </div>
      </body>
    </html>
  );
}

