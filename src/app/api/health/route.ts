import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env/client";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: `v${publicEnv().NEXT_PUBLIC_APP_VERSION}`,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
