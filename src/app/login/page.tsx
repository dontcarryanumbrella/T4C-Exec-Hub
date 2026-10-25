import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requestLogin } from "../actions";
import { currentMember } from "@/lib/auth";
import { SimpleShell } from "@/components/shell";

export const metadata: Metadata = { title: "Sign in · T4C Exec Hub" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  if (await currentMember()) redirect("/");
  const { sent, error } = await searchParams;
  const sender = process.env.GMAIL_USER;
  return (
    <SimpleShell>
      {sent !== undefined ? (
        <>
          <h1>Check your email</h1>
          <p className="lede">
            If that address belongs to a T4C exec, a sign-in link is on its way. It works
            once and expires in 30 minutes.
          </p>
          <ol className="steps">
            <li>Open the email from the T4C Hub.</li>
            <li>Click the link, then “Continue to the hub”.</li>
            <li>You&apos;ll stay signed in on this device.</li>
          </ol>
          <div className="notice" style={{ marginTop: 14 }}>
            <strong>Not in your inbox?</strong> Duke&apos;s Outlook often sends new senders to <strong>Junk</strong>, or
            holds them for a few minutes. Look there, open the email, and click <strong>Not junk</strong>. Then
            add {sender ? <strong>{sender}</strong> : "the sender"} to <strong>Safe senders</strong> (Settings → Mail →
            Junk email) so future links land in your inbox.
          </div>
          <p className="small muted">
            Still nothing? <a href="/login">Request a new link</a>. Only the newest one works.
          </p>
        </>
      ) : (
        <>
          <h1>Sign in</h1>
          <p className="lede">The T4C exec board&apos;s shared week: who&apos;s doing what, and where you can help.</p>
          {error === "netid" && (
            <div className="notice notice-error">
              Use your Duke <strong>alias</strong> email, like first.last@duke.edu, not your NetID address. Both reach the same inbox,
              but the hub knows you by your alias.
            </div>
          )}
          {error === "expired" && (
            <div className="notice notice-error">That link expired or was already used. Request a new one below; it only takes a moment.</div>
          )}
          <form action={requestLogin} className="stack" style={{ marginTop: 16 }}>
            <label>
              Your Duke alias email
              <input type="email" name="email" required autoFocus autoComplete="email" placeholder="first.last@duke.edu" />
            </label>
            <button type="submit" className="wide">Email me a sign-in link</button>
          </form>
          <p className="small muted" style={{ marginTop: 14 }}>
            No password needed. Not a member yet? Ask the President or VP for an invite.
          </p>
        </>
      )}
    </SimpleShell>
  );
}
