import { NextResponse, type NextRequest } from "next/server";
import { CREATOR_COOKIE, decodeAttribution, SOURCE_COOKIE } from "@/lib/attribution";
import { recordVisit } from "@/server/marketing";
import { rateLimit } from "@/server/rate-limit";
import { requestIp, visitorCountry, visitorDevice } from "@/server/request";
import { sameOrigin } from "@/server/origin";

export const dynamic = "force-dynamic";

/** Counts one visit per browser session, under source, country and device. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  const ip = await requestIp();
  if (!(await rateLimit(`track:${ip ?? "none"}`, 30, 3600))) return new NextResponse(null, { status: 204 });
  const a = decodeAttribution(req.cookies.get(SOURCE_COOKIE)?.value);
  const creatorId = req.cookies.get(CREATOR_COOKIE)?.value ?? null;
  const source = a?.source ?? "direct";
  const [country, device] = await Promise.all([visitorCountry(), visitorDevice()]);
  await recordVisit(source, source === "creator" ? creatorId : null, country, device);
  return new NextResponse(null, { status: 204 });
}
