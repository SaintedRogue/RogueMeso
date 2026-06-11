// Serves the VAPID PUBLIC key to the browser at runtime. Done as a route (not a
// NEXT_PUBLIC_* build-time inline) so a single prebuilt image works for any deployer:
// keys are pure runtime env and can change without a rebuild. The public key is not a
// secret. Behind the normal auth gate, which is fine — only signed-in users subscribe.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ publicKey: null }, { status: 401 });
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}
