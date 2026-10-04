/** Minimal PCM WAV encode/decode (16-bit write; 8/16/24/32-bit int and 32-bit float read). Node-only (Buffer). */

/** Encode float channels (-1..1, equal length) as 16-bit PCM WAV. */
export function encodeWav(channels: Float32Array[], sampleRate: number): Buffer {
  const nch = channels.length;
  const len = channels[0]?.length ?? 0;
  const dataBytes = len * nch * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(nch, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * nch * 2, 28);
  b.writeUInt16LE(nch * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      b.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), o);
      o += 2;
    }
  }
  return b;
}

export type DecodedWav = { sampleRate: number; channels: number; mono: Float32Array };

/**
 * Parse a PCM WAV buffer and mix down to mono. Tolerates streamed WAVs from ffmpeg pipes
 * (data chunk size 0 or 0xFFFFFFFF): the data chunk then extends to the end of the buffer.
 */
export function parseWav(buf: Buffer): DecodedWav {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE buffer");
  }
  let off = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      let format = buf.readUInt16LE(body);
      if (format === 0xfffe && size >= 40) format = buf.readUInt16LE(body + 24); // WAVE_FORMAT_EXTENSIBLE sub-format
      fmt = { format, channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === "data") {
      if (!fmt) throw new Error("WAV data chunk before fmt chunk");
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      return { sampleRate: fmt.sampleRate, channels: fmt.channels, mono: decodeSamples(buf, body, size, fmt) };
    }
    off = body + size + (size & 1);
  }
  throw new Error("WAV has no data chunk");
}

function decodeSamples(
  buf: Buffer,
  start: number,
  size: number,
  fmt: { format: number; channels: number; bits: number },
): Float32Array {
  const bps = fmt.bits / 8;
  const frame = bps * fmt.channels;
  const n = Math.floor(size / frame);
  const out = new Float32Array(n);
  const read = (o: number): number => {
    if (fmt.format === 3 && fmt.bits === 32) return buf.readFloatLE(o);
    switch (fmt.bits) {
      case 8: return (buf[o] - 128) / 128;
      case 16: return buf.readInt16LE(o) / 32768;
      case 24: return buf.readIntLE(o, 3) / 8388608;
      case 32: return buf.readInt32LE(o) / 2147483648;
      default: throw new Error(`unsupported WAV bit depth ${fmt.bits}`);
    }
  };
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let c = 0; c < fmt.channels; c++) acc += read(start + i * frame + c * bps);
    out[i] = acc / fmt.channels;
  }
  return out;
}
