import { spawn } from "node:child_process";
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

const processes = [
  start("server", path.join(rootDir, "server"), COLORS.blue),
  start("client", path.join(rootDir, "client"), COLORS.green),
];

let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0, signal));
}

function start(name, cwd, color) {
  const child = spawn(npmCmd, ["run", "dev"], {
    cwd,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
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
