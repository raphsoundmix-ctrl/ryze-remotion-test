import { GenerateRequestSchema, type StreamEvent } from "../../../src/schema";
import { hasLiveKeys, runPipeline } from "../../../src/lib/pipeline";

export const maxDuration = 300; // live runs wait on video generation (~1-3 min) [ASSUMPTION: plan allows 300s]
export const dynamic = "force-dynamic";

/** Live mode burns paid credits. In production it needs LIVE_ACCESS_CODE; locally it just needs the keys. */
const liveEnabled = () =>
  hasLiveKeys() && (Boolean(process.env.LIVE_ACCESS_CODE) || process.env.NODE_ENV !== "production");

export async function GET() {
  return Response.json({ live: liveEnabled(), needsCode: Boolean(process.env.LIVE_ACCESS_CODE) });
}

export async function POST(req: Request) {
  const parsed = GenerateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  }
  const { idea, captionStyle = "hormozi" } = parsed.data;
  const mode = parsed.data.mode ?? "mock";

  if (mode === "live") {
    if (!liveEnabled()) return Response.json({ error: "Live mode is not enabled on this deployment." }, { status: 403 });
    const code = process.env.LIVE_ACCESS_CODE;
    if (code && req.headers.get("x-access-code") !== code) {
      return Response.json({ error: "Wrong or missing access code." }, { status: 401 });
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        const manifest = await runPipeline({ idea, captionStyle, mode }, (message) => send({ type: "log", message }));
        send({ type: "result", manifest });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
