import "vitest";

// Values published by the global setup and read in specs via inject(...).
declare module "vitest" {
  export interface ProvidedContext {
    apiUrl: string;
    mongoUri: string;
    outboxFile: string;
  }
}
