import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: "v0.1.1",
      auto_deploy: "BERHASIL 🚀",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
