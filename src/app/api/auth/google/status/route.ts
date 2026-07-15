import { NextResponse } from "next/server";
import { isConnected } from "@/lib/googleAuth";

export async function GET() {
  return NextResponse.json({ connected: isConnected() });
}
