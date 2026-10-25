"use client";

import Link from "next/link";
import { SimpleShell } from "@/components/shell";

// Friendly fallback for anything unexpected, including blocked requests.
// Nothing was changed when this shows, so it says so.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const known = /permission|no longer exists|exec board/i.test(error.message);
  return (
    <SimpleShell>
      <h1>That didn&apos;t go through</h1>
      <p className="lede">{known ? error.message : "Something went wrong on our side."} Nothing was changed, and your other work is safe.</p>
      <div className="row" style={{ marginTop: 14 }}>
        <button onClick={reset}>Try again</button>
        <Link href="/" className="button secondary">Back to This Week</Link>
      </div>
    </SimpleShell>
  );
}
