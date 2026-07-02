export default async function globalTeardown() {
  const stack = globalThis.__E2E_STACK__;
  if (!stack) return;
  await stack.server.stop();
  await stack.mongo.stop();
  globalThis.__E2E_STACK__ = undefined;
}
