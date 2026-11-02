/**
 * @gdziepolece/core — isomorphic entry (no Node built-ins). Node-only helpers (file loader,
 * SQLite cache) live in "@gdziepolece/core/node".
 *
 * Shipped as TypeScript source with explicit `.ts` import specifiers (no build step):
 * - Node 22.18+ runs it directly (native type stripping; erasable syntax only).
 * - Vitest/Vite handles it natively.
 * - Next.js: add `transpilePackages: ["@gdziepolece/core"]`; consumers' tsconfig needs
 *   `"allowImportingTsExtensions": true` (fine with `noEmit`, which Next uses).
 */
export * from "./aggregate/index.ts";
export * from "./cache/index.ts";
export * from "./calendar/index.ts";
export * from "./currency/index.ts";
export * from "./domain/index.ts";
export * from "./links/index.ts";
export * from "./places/index.ts";
export * from "./sources/index.ts";
