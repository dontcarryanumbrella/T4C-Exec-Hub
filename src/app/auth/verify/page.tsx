import type { Metadata } from "next";
import { confirmLogin } from "../../actions";
import { SimpleShell } from "@/components/shell";

export const metadata: Metadata = { title: "Sign in · T4C Exec Hub" };

// The link lands on a confirm button instead of signing in on GET, so email
// link scanners (e.g. Outlook Safe Links) can't use up the single-use token.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <SimpleShell>
      {token ? (
        <form action={confirmLogin} className="stack">
          <input type="hidden" name="token" value={token} />
          <h1>You&apos;re almost in</h1>
          <p className="lede">One click and you&apos;re signed in. You&apos;ll stay signed in on this device.</p>
          <button type="submit" className="wide">Continue to the hub</button>
        </form>
      ) : (
        <>
          <h1>This link is incomplete</h1>
          <p className="lede">The sign-in address got cut off, which can happen when an email app wraps long links.</p>
          <a href="/login" className="button wide">Get a new sign-in link</a>
        </>
      )}
    </SimpleShell>
  );
}
