import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const COLORS = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
};

// Make sure the local MongoDB container is running before the server boots.
// Without it, connectDB() hangs ~30s and the backend never starts, which
// surfaces to the client as "Request failed with status code 500" on /api.
// Override the container name with MONGO_CONTAINER; skip this step entirely
// with SKIP_DB_START=1 (e.g. when you run MongoDB some other way).
// ensureDatabase();

// Kill any stale process still holding the dev ports. `tsx watch` (server) and
// Vite's strictPort (client) both die on EADDRINUSE, and a leftover from a
// previous run that never shut down cleanly leaves port 4000 dead -> the client
// gets a 500 on /api. Reclaiming the ports first makes `npm run dev` idempotent.
freeStalePorts();

const processes = [
  start("server", path.join(rootDir, "server"), COLORS.blue),
  start("client", path.join(rootDir, "client"), COLORS.green),
];

let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0, signal));
}

function ensureDatabase() {
  if (process.env.SKIP_DB_START === "1") return;
  const container = process.env.MONGO_CONTAINER ?? "money-tracker-mongo";
  const db = (msg) => console.log(`${COLORS.blue}[db]${COLORS.reset} ${msg}`);

  // `docker start` is idempotent: a no-op (exit 0) if the container is already
  // running, and starts it if it was stopped.
  const result = spawnSync("docker", ["start", container], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error) {
    db(`docker not available (${result.error.code}); assuming MongoDB is already running.`);
    return;
  }
  if (result.status === 0) {
    db(`MongoDB container "${container}" is running.`);
    return;
  }
  db(
    `couldn't start container "${container}": ${(result.stderr || "").trim()}. ` +
    `If you run MongoDB another way, set SKIP_DB_START=1 to silence this.`
  );
}

function freeStalePorts() {
  const ports = [Number(process.env.PORT ?? 4000), 5173]; // server, client (vite strictPort)
  for (const port of ports) {
    const owners = portOwners(port).filter((pid) => pid !== String(process.pid));
    if (owners.length === 0) continue;
    console.log(
      `${COLORS.blue}[ports]${COLORS.reset} freeing port ${port} held by stale ` +
      `process${owners.length > 1 ? "es" : ""} ${owners.join(", ")}`
    );
    for (const pid of owners) killPid(pid);
  }
}

/** PIDs currently LISTENING on a TCP port. Best-effort; returns [] on any error. */
function portOwners(port) {
  if (process.platform === "win32") {
    const out = spawnSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" }).stdout ?? "";
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const m = line.match(/^\s*TCP\s+\S+:(\d+)\s/);
      if (m && Number(m[1]) === port) {
        const pid = line.trim().split(/\s+/).pop();
        if (/^\d+$/.test(pid)) pids.add(pid);
      }
    }
    return [...pids];
  }
  const out = spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout ?? "";
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function killPid(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", pid, "/F", "/T"], { encoding: "utf8" });
  } else {
    spawnSync("kill", ["-9", pid]);
  }
}

function start(name, cwd, color) {
  const child = spawn(npmCmd, ["run", "dev"], {
    cwd,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  pipeLines(child.stdout, name, color);
  pipeLines(child.stderr, name, color);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code ?? 0;
    if (signal) {
      console.log(`${color}[${name}] exited with signal ${signal}${COLORS.reset}`);
    } else if (exitCode !== 0) {
      console.log(`${color}[${name}] exited with code ${exitCode}${COLORS.reset}`);
    }
    shutdown(exitCode, signal);
  });

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`${color}[${name}] failed to start: ${error.message}${COLORS.reset}`);
    shutdown(1);
  });

  return child;
}

function pipeLines(stream, name, color) {
  const reader = createInterface({ input: stream });
  reader.on("line", (line) => {
    console.log(`${color}[${name}]${COLORS.reset} ${line}`);
  });
}

function shutdown(exitCode = 0, signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    if (!child.killed) child.kill(signal ?? "SIGTERM");
  }

  setTimeout(() => process.exit(exitCode), 100);
}
