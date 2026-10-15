import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SECURITY_HEADERS } from "./src/lib/security/security-headers";

/** Sumber tunggal versi aplikasi: field `version` di package.json. */
function readAppVersion(): string {
  const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf-8");
  const { version } = JSON.parse(raw) as { version?: unknown };
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error("Field `version` di package.json wajib diisi (string semver).");
  }
  return version.trim();
}

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: readAppVersion(),
  },
  // Header keamanan untuk semua rute (halaman, `/api/**`, aset); isi & alasan di `security-headers.ts`.
  headers: async () => [{ source: "/:path*", headers: [...SECURITY_HEADERS] }],
};

export default nextConfig;
