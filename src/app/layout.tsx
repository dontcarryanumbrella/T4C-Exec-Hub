import type { Metadata } from "next";
import { Suspense } from "react";
import { readFlash } from "@/lib/flash";
import { FlashToast, FormFeedback } from "@/components/client";
import "./globals.css";

export const metadata: Metadata = {
  title: "T4C Exec Hub",
  description: "T4C exec board: who's doing what this week.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const flash = await readFlash();
  return (
    <html lang="en">
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
