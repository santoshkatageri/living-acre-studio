/*  Just enough of node:fs / node:path for the report scripts.

    The project pins no @types/node (adding one would be a new dependency), and
    tsconfig sets "types": [], so the few node built-ins the scripts use are
    declared here by hand. Only what is actually called is declared. */

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string, encoding: "utf8"): void;
  export function mkdirSync(path: string, options: { recursive: true }): void;
  export function existsSync(path: string): boolean;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function resolve(...parts: string[]): string;
}

declare module "node:crypto" {
  interface Hash {
    update(data: string, encoding: "utf8"): Hash;
    digest(encoding: "hex"): string;
  }
  export function createHash(algorithm: "sha256"): Hash;
}

declare const process: { exitCode: number };
