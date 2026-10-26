// The hub's public address, for links in emails and calendar feeds. Trailing
// slashes are dropped so paths join cleanly even if APP_URL ends with "/".
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}
