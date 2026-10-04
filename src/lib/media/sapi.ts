/**
 * Offline Windows TTS (System.Speech / SAPI) via `powershell -NoProfile -EncodedCommand` with an inline C# class.
 * Speaks each line to a 16 kHz mono WAV and records SpeakProgress events (word start = AudioPosition).
 * [CONFIRMED 2026-10-04] AudioPosition is only correct at 16 kHz output; at 22.05/44.1 kHz it is scaled by rate/16000.
 * Node-only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./ffmpeg";

export const SAPI_RATE_HZ = 16000;

export type SapiEvent = { audioMs: number; charPos: number; charLen: number; text: string };
export type SapiJob = { key: string; text: string; rate: number };
export type SapiResult = { key: string; wavPath: string; events: SapiEvent[] };

const CSHARP = `
using System; using System.Text; using System.Globalization;
using System.Speech.Synthesis; using System.Speech.AudioFormat;
public static class RyzeTts {
  public static string Voices() {
    var sb = new StringBuilder();
    using (var s = new SpeechSynthesizer()) {
      foreach (var v in s.GetInstalledVoices()) {
        if (!v.Enabled) continue;
        sb.Append(v.VoiceInfo.Name).Append('\\t').Append(v.VoiceInfo.Culture.Name).Append('\\t').Append(v.VoiceInfo.Gender).Append('\\n');
      }
    }
    return sb.ToString();
  }
  public static string Speak(string voice, int rate, string text, string wavPath) {
    var sb = new StringBuilder();
    using (var s = new SpeechSynthesizer()) {
      s.SelectVoice(voice);
      s.Rate = rate;
      s.SetOutputToWaveFile(wavPath, new SpeechAudioFormatInfo(${SAPI_RATE_HZ}, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
      s.SpeakProgress += (o, e) => {
        sb.Append(e.AudioPosition.TotalMilliseconds.ToString(CultureInfo.InvariantCulture)).Append('\\t')
          .Append(e.CharacterPosition).Append('\\t').Append(e.CharacterCount).Append('\\t')
          .Append(e.Text.Replace('\\t', ' ').Replace('\\r', ' ').Replace('\\n', ' ')).Append('\\n');
      };
      s.Speak(text);
      s.SetOutputToNull();
    }
    return sb.ToString();
  }
}`;

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

async function powershell(script: string): Promise<string> {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const r = await run("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded]);
  if (r.code !== 0) throw new Error(`powershell exited ${r.code}: ${r.stderr.trim().split(/\r?\n/).slice(-4).join(" | ")}`);
  return r.stdout.toString("utf8");
}

const header = `$ErrorActionPreference = 'Stop'\nAdd-Type -TypeDefinition @"\n${CSHARP}\n"@ -ReferencedAssemblies System.Speech\n`;

export type SapiVoice = { name: string; culture: string; gender: string };

export async function listSapiVoices(): Promise<SapiVoice[]> {
  if (process.platform !== "win32") return [];
  const out = await powershell(`${header}[Console]::Out.Write([RyzeTts]::Voices())`);
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [name, culture, gender] = l.split("\t");
      return { name, culture, gender };
    });
}

/** en-US, female preferred (Zira), else any en-*, else the first voice. */
export function pickVoice(voices: SapiVoice[]): SapiVoice | null {
  const en = voices.filter((v) => /^en-US$/i.test(v.culture));
  return (
    en.find((v) => /zira/i.test(v.name)) ??
    en.find((v) => /female/i.test(v.gender)) ??
    en[0] ??
    voices.find((v) => /^en/i.test(v.culture)) ??
    voices[0] ??
    null
  );
}

/** Speak every job in ONE PowerShell process; WAVs + event TSVs land in a temp dir. */
export async function speakAll(voice: string, jobs: SapiJob[]): Promise<SapiResult[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ryze-sapi-"));
  const lines = jobs.map((j) => {
    const wav = path.join(dir, `${j.key}.wav`);
    const tsv = path.join(dir, `${j.key}.tsv`);
    return `[IO.File]::WriteAllText(${psQuote(tsv)}, [RyzeTts]::Speak(${psQuote(voice)}, ${j.rate}, ${psQuote(j.text)}, ${psQuote(wav)}))`;
  });
  await powershell(`${header}${lines.join("\n")}\n`);
  return jobs.map((j) => {
    const wavPath = path.join(dir, `${j.key}.wav`);
    const tsv = fs.readFileSync(path.join(dir, `${j.key}.tsv`), "utf8");
    const events = tsv
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [ms, pos, len, ...text] = l.split("\t");
        return { audioMs: Number(ms), charPos: Number(pos), charLen: Number(len), text: text.join("\t") };
      });
    return { key: j.key, wavPath, events };
  });
}
