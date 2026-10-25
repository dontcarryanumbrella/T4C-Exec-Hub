import { cookies } from "next/headers";

// A one-time notice shown after an action: what just happened, an optional
// Undo, and an optional next step. Set by server actions, shown by <Toast>.
export type Flash = {
  id: string;
  text: string;
  tone: "success" | "info" | "error";
  undoId?: string;
  next?: { label: string; href: string };
};

export const FLASH_COOKIE = "hub_flash";

export async function setFlash(f: Omit<Flash, "id">): Promise<void> {
  const value: Flash = { ...f, id: Math.random().toString(36).slice(2) };
  // Readable by the page so the toast can clear it once shown; it holds no secrets.
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(JSON.stringify(value)), { path: "/", maxAge: 60, sameSite: "lax" });
}

export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const f = JSON.parse(decodeURIComponent(raw)) as Flash;
    return typeof f?.text === "string" ? f : null;
  } catch {
    return null;
  }
}
