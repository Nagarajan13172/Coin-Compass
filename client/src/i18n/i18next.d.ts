// Translation catalogs are discovered and loaded at runtime (see ./index.ts via
// import.meta.glob), so t() keys are plain strings validated by the catalog tests
// (key parity + key-existence scan) rather than by the compiler. This keeps adding
// a namespace to just dropping in a JSON pair, with no central type to maintain.
export {};
