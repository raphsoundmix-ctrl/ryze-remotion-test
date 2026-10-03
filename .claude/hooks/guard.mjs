// PreToolUse guard for Bash | PowerShell | Write | Edit | MultiEdit | NotebookEdit.
// Exit 2 = block (stderr is shown to Claude). Exit 0 = allow. Node-only: Windows/macOS/Linux.
// Covers PowerShell because Claude Code on Windows has a separate PowerShell tool (same {command} payload).
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ti = input.tool_input || {};
const block = (msg) => { console.error(`[guard] BLOCKED: ${msg}`); process.exit(2); };

const ENV_FILE = /(^|[\\/])\.env(\.(?!example$)[^\\/]+)?$/; // .env, .env.local, ... but not .env.example
const HARNESS = /\.claude[\\/](settings(\.local)?\.json|hooks[\\/]?)/;

/* ---------- file tools ---------- */
const fp = String(ti.file_path ?? ti.notebook_path ?? ti.path ?? "").replace(/\\/g, "/");
if (fp) {
  if (ENV_FILE.test(fp)) block("agents never write .env files (the user creates .env.local). Use .env.example with empty values.");
  if (/(^|\/)(\.git|node_modules)\//.test(fp)) block("do not write inside .git or node_modules.");
  if (HARNESS.test(fp)) block("harness files (.claude/settings*.json, .claude/hooks/) are user-owned. Put the needed change into docs/BLOCKER.md.");
}

/* ---------- shell tools (Bash and PowerShell) ---------- */
const cmd = String(ti.command ?? "");
if (cmd) {
  const RULES = [
    [/\bgit\s+push\b[^\n]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/, "force push is forbidden."],
    [/\bgit\s+reset\s+--hard\b/, "use `git restore` or `git revert` instead of reset --hard."],
    [/\bgit\s+clean\s+-\w*f/, "git clean -f can delete untracked assets."],
    [/\b(curl|wget)\b[^\n|]*\|\s*(sh|bash|zsh|pwsh|powershell)\b/i, "piping downloads into a shell is forbidden."],
    [/\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*\|\s*(iex|Invoke-Expression)\b/i, "piping downloads into Invoke-Expression is forbidden."],
    [/\b(iex|Invoke-Expression)\s*\(\s*(iwr|irm|Invoke-WebRequest|Invoke-RestMethod|New-Object)/i, "Invoke-Expression of downloaded code is forbidden."],
    [/\brm\s+-\w*[rR]\w*\s+(\/|~|\.\.|[A-Za-z]:[\\/]|\$HOME|\*)/, "recursive delete outside the repo is forbidden."],
    [/\b(Remove-Item|ri|del|erase|rmdir|rd)\b(?=[^\n]*-(Recurse|r)\b)[^\n]*(\s|['"])([A-Za-z]:[\\/]|\\\\|~|\.\.[\\/]|\$env:|\$HOME)/i, "recursive delete outside the repo is forbidden."],
    [/\bnpm\s+publish\b/, "npm publish is forbidden."],
    [/\bvercel\s+(env\s+(add|rm|remove)|remove|rm|project\s+(rm|remove)|domains\b)/, "this Vercel command changes secrets/projects/domains. The demo needs zero secrets."],
    [/(^|[\s;|&(])(cat|type|more|less|head|tail|Get-Content|gc|Select-String)\s+[^\n;|&]*\.env(?!\.example)(\.\w+)?(['"\s)]|$|;|\|)/i, "reading .env files is forbidden."],
    [/(echo|printf|Write-Output|Write-Host)\s+[^\n]*\$\{?[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)\b/, "printing secrets is forbidden."],
    [/\$env:[A-Za-z_]*(KEY|TOKEN|SECRET|PASSWORD)\b/i, "reading secret environment variables is forbidden."],
    [/\bprintenv\b/, "dumping the environment is forbidden."],
    [/(^|[;&|]\s*)env\s*($|[|;&>])/, "dumping the environment is forbidden."],
    [/\b(Get-ChildItem|gci|dir|ls)\s+env:/i, "dumping the environment is forbidden."],
  ];
  for (const [re, msg] of RULES) if (msg && re.test(cmd)) block(msg);

  const writesHarness = HARNESS.test(cmd) &&
    /(>|>>|\bsed\s+-i|\btee\b|\brm\b|\bmv\b|\bcp\b|\bchmod\b|writeFile|Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|Remove-Item|New-Item)/i.test(cmd);
  if (writesHarness) block("harness files are user-owned; do not modify them from a shell.");

  if (/\bgit\s+commit\b/.test(cmd)) {
    if (/(^|[;&|]\s*)git\s+add\b/.test(cmd)) block("run `git add` and `git commit` as SEPARATE commands (the secret scan reads the staged index).");
    scanStaged(/\s-\w*a\w*\b|--all\b/.test(cmd));
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: projectDir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

function scanStaged(includeTracked) {
  const base = includeTracked ? "HEAD" : "--cached";
  let names = [];
  try { names = git(["diff", base, "--name-only"]).split("\n").filter(Boolean); } catch { return; }
  for (const n of names) {
    if (ENV_FILE.test(n)) block(`staged env file: ${n}`);
    if (/(^|\/)\.vercel\//.test(n)) block(`staged .vercel/ file: ${n}`);
    if (/(^|\/)node_modules\//.test(n)) block(`staged node_modules file: ${n}`);
    try {
      const size = statSync(`${projectDir}/${n}`).size;
      if (size > 50 * 1024 * 1024) block(`${n} is ${(size / 1048576).toFixed(0)} MB (>50 MB).`);
      if (n.startsWith("public/") && size > 8 * 1024 * 1024) block(`${n} is ${(size / 1048576).toFixed(1)} MB (>8 MB budget for public/). Compress it.`);
    } catch { /* deleted file */ }
  }
  let diff = "";
  try { diff = git(["diff", base, "-U0", "--no-color"]); } catch { return; }
  const added = diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const SECRETS = [
    /\bsk-[A-Za-z0-9_-]{20,}/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bgithub_pat_[A-Za-z0-9_]{30,}/, /\bvca_[A-Za-z0-9]{16,}/,
    /\bAKIA[0-9A-Z]{16}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b(api[_-]?key|secret|token|passw(or)?d|authorization)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-/+=]{20,}["']/i,
    /\bxi-api-key\b[^\n]*[A-Za-z0-9]{20,}/i, /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32}\b/,
  ];
  for (const re of SECRETS) for (const l of added) if (re.test(l)) block(`possible secret in staged diff: ${l.slice(0, 70)}…`);
}
process.exit(0);
