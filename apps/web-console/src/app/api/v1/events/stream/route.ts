import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const apiOrigin = process.env.FIELDOPS_API_ORIGIN ?? "http://localhost:8080";
  const upstream = new URL("/api/v1/events/stream", apiOrigin);
  upstream.search = request.nextUrl.search;

  const headers = new Headers({ Accept: "text/event-stream" });
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const response = await fetch(upstream, {
    method: "GET",
    headers,
    cache: "no-store",
    signal: request.signal,
  });

  const outgoing = new Headers();
  outgoing.set("content-type", response.headers.get("content-type") ?? "text/event-stream");
  outgoing.set("cache-control", "no-cache, no-transform");
  outgoing.set("x-accel-buffering", "no");
  return new Response(response.body, {
    status: response.status,
    headers: outgoing,
  });
}
