// Load .env.local for CLI scripts (Next loads it for the web app on its own).
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no .env.local: fine for mock mode */
}
