import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";

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
};

export default nextConfig;
