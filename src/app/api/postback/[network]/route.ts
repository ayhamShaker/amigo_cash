import { NextResponse, type NextRequest } from "next/server";
import { handlePostback } from "@/server/postback";
import { clientIpFromHeaders } from "@/lib/ip";
import { env } from "@/lib/env";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, ctx: { params: Promise<{ network: string }> }) {
  const { network } = await ctx.params;
  if (!/^[a-z0-9-]{2,30}$/.test(network)) return new NextResponse("unknown network", { status: 404 });
  const e = env();
  const ip = clientIpFromHeaders(req.headers, e.TRUSTED_PROXY_HOPS, e.TRUST_CLOUDFLARE);
  if (!(await rateLimit(`postback:${network}:${ip ?? "none"}`, 600, 60))) return new NextResponse("slow down", { status: 429 });

  // Some networks POST form fields instead of query parameters; treat them the same.
  const url = new URL(req.url);
  if (req.method === "POST") {
    const type = req.headers.get("content-type") ?? "";
    if (type.includes("application/x-www-form-urlencoded")) {
      const body = new URLSearchParams((await req.text()).slice(0, 10_000));
      for (const [k, v] of body) if (!url.searchParams.has(k)) url.searchParams.set(k, v);
    }
  }
  try {
    const r = await handlePostback(network, url, ip);
    if (r.outcome === "refused") console.warn(`[postback] ${network} refused: ${r.reason}`);
    return new NextResponse(r.body, { status: r.http, headers: { "content-type": "text/plain" } });
  } catch (err) {
    console.error(`[postback] ${network} failed`, (err as Error).message);
    // 500 makes the network retry later
    return new NextResponse("error", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
