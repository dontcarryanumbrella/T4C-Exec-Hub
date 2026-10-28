import type { Metadata } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { readFlash } from "@/lib/flash";
import { FlashToast, FormFeedback } from "@/components/client";
import "./globals.css";

export const metadata: Metadata = {
  title: "T4C Exec Hub",
  description: "T4C exec board: who's doing what this week.",
};

// Headings only; body text stays on the system font.
const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--display", display: "swap" });

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const flash = await readFlash();
  return (
    <html lang="en" className={display.variable}>
      <body>
        <Suspense fallback={null}>
          <FormFeedback />
        </Suspense>
        {children}
        <FlashToast key={flash?.id ?? "none"} flash={flash} />
      </body>
    </html>
  );
}
