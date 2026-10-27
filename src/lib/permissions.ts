// What a person may do in the hub. Admins edit these per person on the
// Admin page; presets fill them in quickly. Every check runs on the server.
export const PERMISSIONS = [
  { key: "canPropose", label: "Propose ideas" },
  { key: "canCreateProjects", label: "Create projects directly" },
  { key: "canApprove", label: "Approve or decline proposals" },
  { key: "canManageTasks", label: "Add, assign, and edit tasks in any project" },
  { key: "canWriteNotes", label: "Write meeting notes" },
  { key: "canManageMembers", label: "Manage members and permissions" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export type PermissionSet = Record<Permission, boolean>;

const none: PermissionSet = {
  canPropose: false,
  canCreateProjects: false,
  canApprove: false,
  canManageTasks: false,
  canWriteNotes: false,
  canManageMembers: false,
};

export const PRESETS: Record<"admin" | "exec" | "adviser", { label: string; perms: PermissionSet }> = {
  admin: { label: "Admin", perms: Object.fromEntries(Object.keys(none).map((k) => [k, true])) as PermissionSet },
  exec: { label: "Exec", perms: { ...none, canPropose: true, canWriteNotes: true } },
  adviser: { label: "Adviser / faculty", perms: { ...none, canPropose: true } },
};

export function can(member: Partial<PermissionSet> | null | undefined, perm: Permission): boolean {
  return !!member?.[perm];
}

// The Admin tab is for anyone who manages people.
export function seesAdmin(member: Partial<PermissionSet>): boolean {
  return can(member, "canManageMembers");
}

// Matches a member's checkboxes to a preset name, for display.
export function presetName(member: PermissionSet): string {
  for (const p of Object.values(PRESETS))
    if (PERMISSIONS.every(({ key }) => member[key] === p.perms[key])) return p.label;
  return "Custom";
}
