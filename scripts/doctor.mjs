// npm run doctor: environment check with fix hints. Exit 1 only if Node/git are unusable.
import { spawnSync } from "node:child_process";

const sh = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: "utf8", shell: process.platform === "win32" }); return r.status === 0 ? (r.stdout || r.stderr).trim().split("\n")[0] : null; };
const rows = []; let fatal = false;
const row = (name, ok, detail, hint = "", required = false) => { rows.push({ name, ok, detail, hint, required }); if (required && !ok) fatal = true; };

const nodeMajor = Number(process.versions.node.split(".")[0]);
row("node >= 20.9", nodeMajor >= 20, `v${process.versions.node}`, "install Node 22 LTS", true);
row("git", !!sh("git", ["--version"]), sh("git", ["--version"]) ?? "missing", "install Git (on Windows also gives Git Bash used by Claude Code hooks)", true);
row("git identity", !!sh("git", ["config", "user.email"]), sh("git", ["config", "user.email"]) ?? "not set", 'git config --global user.name "You"; git config --global user.email "you@x"');
row("gh (GitHub CLI)", !!sh("gh", ["--version"]), sh("gh", ["--version"]) ?? "missing", "optional: winget install GitHub.cli, or push with plain git credentials");
row("gh auth", !!sh("gh", ["auth", "status"]), sh("gh", ["auth", "status"]) ?? "not logged in", "gh auth login   (USER step)");
row("vercel CLI", !!sh("vercel", ["--version"]), sh("vercel", ["--version"]) ?? "missing", "npm i -g vercel   (or use `npx vercel`)");
row("vercel auth", !!sh("vercel", ["whoami"]), sh("vercel", ["whoami"]) ?? "not logged in", "vercel login   (USER step; never paste tokens into chat)");
row("ffmpeg (bundled in Remotion)", !!sh("npx", ["remotion", "ffmpeg", "-version"]), sh("npx", ["remotion", "ffmpeg", "-version"]) ?? "run npm install first", "npm install");
row("ffprobe (bundled in Remotion)", !!sh("npx", ["remotion", "ffprobe", "-version"]), sh("npx", ["remotion", "ffprobe", "-version"]) ?? "run npm install first", "npm install");

const reach = async (name, url) => {
  try { const c = new AbortController(); setTimeout(() => c.abort(), 6000); const r = await fetch(url, { method: "HEAD", signal: c.signal }); const denied = r.headers.get("x-deny-reason"); row(`net: ${name}`, !denied && r.status < 500, denied ? `BLOCKED by egress proxy (${denied})` : `HTTP ${r.status}`, denied ? "allow this host in the network/proxy settings" : ""); }
  catch (e) { row(`net: ${name}`, false, String(e.cause?.code ?? e.name), name === "remotion.media" ? "Chrome Headless Shell comes from here. If blocked: set REMOTION_BROWSER_EXECUTABLE to a local Chrome/Chromium, pass --browser to npm run render" : "check proxy/firewall"); }
};
async function main() {
  await Promise.all([reach("registry.npmjs.org", "https://registry.npmjs.org/remotion"), reach("github.com", "https://github.com"), reach("vercel.com", "https://vercel.com"), reach("remotion.media", "https://remotion.media")]);
  for (const r of rows) console.log(`${r.ok ? "OK  " : r.required ? "FAIL" : "WARN"}  ${r.name.padEnd(30)} ${r.detail}${!r.ok && r.hint ? `   -> ${r.hint}` : ""}`);
  process.exit(fatal ? 1 : 0);
}
main();
