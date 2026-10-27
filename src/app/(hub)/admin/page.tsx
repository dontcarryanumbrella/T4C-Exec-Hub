import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell";
import { ConfirmButton } from "@/components/client";
import { requireMember } from "@/lib/auth";
import { PERMISSIONS, PRESETS, can, presetName } from "@/lib/permissions";
import { Avatar } from "@/components/bits";
import { Icon } from "@/components/icons";
import { Menu } from "@/components/Menu";
import { inviteMember, removeMember, resendInvite, setPermissions, updateMember } from "../../actions";

export const metadata: Metadata = { title: "Admin · T4C Exec Hub" };

// One quiet row per person. Changing access or details opens right under
// that row; everything else is in the row's ⋯ menu.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ invite?: string; access?: string; edit?: string }> }) {
  const me = await requireMember();
  if (!can(me, "canManageMembers")) redirect("/");
  const q = await searchParams;
  const members = await db.member.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader
        title="Members"
        actions={<Link href="/admin?invite=1" className="button">Invite</Link>}
      />

      {q.invite && (
        <form action={inviteMember} className="box stack" style={{ maxWidth: 560, margin: "12px 0 20px" }}>
          <div className="grid2">
            <label>Name<input type="text" name="name" required autoFocus maxLength={80} /></label>
            <label>Duke email<input type="email" name="email" required maxLength={254} /></label>
          </div>
          <div className="grid2">
            <label>Role<input type="text" name="role" maxLength={100} placeholder="e.g. Faculty adviser" /></label>
            <label>
              Type
              <select name="kind" defaultValue="exec">
                <option value="exec">Exec</option>
                <option value="adviser">Adviser</option>
                <option value="faculty">Faculty</option>
              </select>
            </label>
          </div>
          <div className="row">
            <button>Send invite</button>
            <Link href="/admin" className="button secondary">Cancel</Link>
          </div>
        </form>
      )}

      <div className="list">
        <div className="list-head cols-member">
          <span>Name</span>
          <span>Role</span>
          <span>Access</span>
          <span>Status</span>
          <span />
        </div>
        {members.map((m) => (
          <div key={m.id}>
            <div className="list-row cols-member">
              <span className="name">
                <Avatar name={m.name} look={m} seen={m.lastSeenAt} />
                <span>{m.name}{m.id === me.id && <span className="you">You</span>}</span>
              </span>
              <span className="cell optional">{m.role || "—"}</span>
              <span className="cell"><span className="chip">{presetName(m)}</span></span>
              <span className="cell optional">{m.joinedAt ? "Joined" : <span className="status attention">Invited</span>}</span>
              <span className="row-actions">
                <Menu label={`Actions for ${m.name}`}>
                  <Link href={`/admin?access=${m.id}`} className="menu-item"><Icon name="shield" /> Change access</Link>
                  <Link href={`/admin?edit=${m.id}`} className="menu-item"><Icon name="user" /> Edit details</Link>
                  <form action={resendInvite}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <button className="menu-item"><Icon name="link" /> {m.joinedAt ? "Email a sign-in link" : "Resend invite"}</button>
                  </form>
                  {m.id !== me.id && (
                    <>
                      <div className="menu-sep" />
                      <form action={removeMember}>
                        <input type="hidden" name="memberId" value={m.id} />
                        <input type="hidden" name="back" value="/admin" />
                        <ConfirmButton
                          message={`Remove ${m.name}? They lose access right away, and their open tasks become up for grabs.`}
                          className="menu-item danger"
                        >
                          <Icon name="out" /> Remove from hub
                        </ConfirmButton>
                      </form>
                    </>
                  )}
                </Menu>
              </span>
            </div>

            {q.access === m.id && (
              <form action={setPermissions} className="row-detail stack">
                <input type="hidden" name="memberId" value={m.id} />
                <input type="hidden" name="back" value="/admin" />
                <div className="row" style={{ gap: 8 }}>
                  <span className="small muted">Quick set:</span>
                  {Object.entries(PRESETS).map(([key, p]) => (
                    <button key={key} name="preset" value={key} className="secondary small">{p.label}</button>
                  ))}
                </div>
                <div className="perm-grid">
                  {PERMISSIONS.map(({ key, label }) => (
                    <label key={key} className="inline" style={{ margin: 0 }}>
                      <input type="checkbox" name={key} defaultChecked={m[key]} disabled={key === "canManageMembers" && m.id === me.id} />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="row">
                  <button>Save</button>
                  <Link href="/admin" className="button secondary">Cancel</Link>
                </div>
              </form>
            )}

            {q.edit === m.id && (
              <form action={updateMember} className="row-detail stack">
                <input type="hidden" name="memberId" value={m.id} />
                <input type="hidden" name="back" value="/admin" />
                <div className="grid2">
                  <label>Name<input type="text" name="name" defaultValue={m.name} maxLength={80} /></label>
                  <label>Email<input type="email" name="email" defaultValue={m.email} maxLength={254} /></label>
                </div>
                <div className="grid2">
                  <label>Role<input type="text" name="role" defaultValue={m.role} maxLength={100} /></label>
                  <div className="grid2">
                    <label>
                      Type
                      <select name="kind" defaultValue={m.kind}>
                        <option value="exec">Exec</option>
                        <option value="adviser">Adviser</option>
                        <option value="faculty">Faculty</option>
                      </select>
                    </label>
                    <label>Card order<input type="text" name="sortOrder" defaultValue={m.sortOrder} /></label>
                  </div>
                </div>
                <div className="row">
                  <button>Save</button>
                  <Link href="/admin" className="button secondary">Cancel</Link>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
