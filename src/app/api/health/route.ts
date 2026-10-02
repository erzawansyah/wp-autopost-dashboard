import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: "v0.1.2",
      message: "Portainer Auto-Redeploy Terbukti Berhasil! 🎉",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
