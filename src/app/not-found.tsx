import Link from "next/link";
import { SimpleShell } from "@/components/shell";

export default function NotFound() {
  return (
    <SimpleShell>
      <h1>We couldn&apos;t find that</h1>
      <p className="lede">The page may have been removed, or the link was mistyped.</p>
      <div className="row" style={{ marginTop: 14 }}>
        <Link href="/" className="button">Back to This Week</Link>
        <Link href="/projects" className="button secondary">See all projects</Link>
      </div>
    </SimpleShell>
  );
}
