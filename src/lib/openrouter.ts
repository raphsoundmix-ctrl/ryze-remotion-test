import { z } from "zod";
import { ScriptSchema, type Script } from "../schema";

/** [ASSUMPTION] slug valid on openrouter.ai/models today; override with OPENROUTER_MODEL. */
export const llmModel = () => process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5";

const SYSTEM = `You write scripts for 20-30 second vertical short-form video ads (TikTok/Reels).
Return ONLY JSON matching the schema: exactly 3 scenes.
Scene 1 = pattern-interrupt hook, scene 2 = proof/demo, scene 3 = payoff + CTA.
Voiceover: conversational, concrete, max 2 short sentences per scene.
visualPrompt: one vivid shot, vertical 9:16, no on-screen text, no logos, no recognizable faces.`;

const stripFences = (s: string) => s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

export async function generateScript(idea: string): Promise<Script> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const { $schema: _omit, ...jsonSchema } = z.toJSONSchema(ScriptSchema) as Record<string, unknown>;
  let lastErr = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "ryze-video-engine",
      },
      body: JSON.stringify({
        model: llmModel(),
        temperature: 0.8,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Idea: ${idea}${lastErr ? `\n\nPrevious output was invalid: ${lastErr}. Fix it.` : ""}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "video_script", strict: true, schema: jsonSchema } },
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    try {
      return ScriptSchema.parse(JSON.parse(stripFences(content ?? "")));
    } catch (e) {
      lastErr = e instanceof Error ? e.message.slice(0, 200) : "parse error";
      if (attempt === 2) throw new Error(`LLM returned invalid script twice: ${lastErr}`);
    }
  }
  throw new Error("unreachable");
}
