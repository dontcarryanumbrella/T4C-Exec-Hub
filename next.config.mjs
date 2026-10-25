/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Nobody can embed the hub in a frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  // Sign-in URLs carry a token, so other sites never get a referrer. Not
  // "no-referrer": that makes browsers send "Origin: null" on plain form
  // posts, which Next.js then rejects as a cross-site request.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
