import { spawn, type ChildProcess } from "node:child_process";
import kill from "tree-kill";
import { API_URL, JWT_SECRET, SERVER_DIR, SERVER_PORT } from "./config";
import { createMailSink } from "./mailSink";

export interface ServerHandle {
  stop: () => Promise<void>;
}

/**
 * Spawn the real CoinCompass server (via tsx) against the given Mongo URI and
 * wait until it answers /api/health. Runs in-process node (no shell wrapper) so
 * a single PID owns the server and can be killed cleanly on all platforms.
 */
export async function startServer(
  mongoUri: string,
  outboxFile: string,
  extraEnv: NodeJS.ProcessEnv = {}
): Promise<ServerHandle> {
  const sink = createMailSink(outboxFile);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(SERVER_PORT),
    MONGO_URI: mongoUri,
    AUTH_JWT_SECRET: JWT_SECRET,
    CLIENT_URL: "http://127.0.0.1:4598",
    APP_URL: "http://127.0.0.1:4598",
    // Force the console-mail fallback so the harness can capture codes/links.
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASS: "",
    // Keep optional integrations dormant during tests.
    GOLD_API_KEY: "",
    ...extraEnv,
  };

  const child: ChildProcess = spawn("node", ["--import", "tsx", "src/index.ts"], {
    cwd: SERVER_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const echo = Boolean(process.env.TEST_SERVER_LOG);
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (d: string) => {
    sink.write(d);
    if (echo) process.stdout.write(`[srv] ${d}`);
  });
  child.stderr?.on("data", (d: string) => {
    if (echo) process.stderr.write(`[srv:err] ${d}`);
  });

  let exited = false;
  child.once("exit", (code) => {
    exited = true;
    if (echo) process.stderr.write(`[srv] exited with code ${code}\n`);
  });

  await waitForHealth(() => exited);

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        sink.close();
        if (child.pid == null || exited) return resolve();
        kill(child.pid, "SIGKILL", () => resolve());
        setTimeout(resolve, 5000); // safety net
      }),
  };
}

async function waitForHealth(hasExited: () => boolean, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (hasExited()) throw new Error("Server process exited before becoming healthy (check TEST_SERVER_LOG=1).");
    try {
      const res = await fetch(`${API_URL}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server did not answer ${API_URL}/health within ${timeoutMs}ms.`);
}
