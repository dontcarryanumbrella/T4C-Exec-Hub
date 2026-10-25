import Link from "next/link";

// The T4C mark, used in the nav and on every page outside it, so sign-in,
// errors, and the hub all read as the same site.
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="brand" aria-label="T4C Exec Hub home">
      <span className="brand-mark" aria-hidden>T4C</span>
      <span className="brand-name">Exec Hub</span>
    </Link>
  );
}

// Same top of page everywhere: optional back link, title, one line about
// what this page is for, and the page's actions on the right.
export function PageHeader({
  title,
  sub,
  back,
  actions,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {back && (
          <Link href={back.href} className="back-link">← {back.label}</Link>
        )}
        <h1>{title}</h1>
        {sub && <p className="lede">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

// Pages outside the signed-in hub (sign-in, errors) share this frame.
export function SimpleShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="nav">
        <Brand href="/login" />
      </nav>
      <main className="page narrow">
        <div className="card-panel">{children}</div>
      </main>
    </>
  );
}
