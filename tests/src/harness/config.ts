import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** tests/ package root and the sibling app packages. */
export const TESTS_ROOT = path.resolve(here, "../..");
export const REPO_ROOT = path.resolve(TESTS_ROOT, "..");
export const SERVER_DIR = path.join(REPO_ROOT, "server");
export const CLIENT_DIR = path.join(REPO_ROOT, "client");

/** Port the spawned server listens on for tests (override with TEST_SERVER_PORT). */
export const SERVER_PORT = Number(process.env.TEST_SERVER_PORT ?? 4599);
export const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
export const API_URL = `${BASE_URL}/api`;

/** Dedicated secrets/config the harness injects into the server child process. */
export const JWT_SECRET = "coincompass-test-jwt-secret-do-not-use-in-prod";

/** Captured outgoing mail (verification links, reset links, 2FA codes) as JSONL. */
export const OUTBOX_FILE = path.join(TESTS_ROOT, "reports", ".outbox.jsonl");
