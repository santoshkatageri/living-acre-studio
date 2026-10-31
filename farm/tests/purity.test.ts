import { describe, expect, test } from "vitest";

/*  Architecture guards. src/sim is pure: no three, no DOM, no node built-ins.
    src/sim/collision.ts names no zone — the rule is data. */

const modules = import.meta.glob("../src/sim/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

describe("src/sim stays pure", () => {
  test("no sim module imports three, the DOM or node built-ins", () => {
    expect(Object.keys(modules).length).toBeGreaterThan(10);
    for (const [path, source] of Object.entries(modules)) {
      const code = stripComments(source);
      expect(code.includes('from "three"'), `${path} imports three`).toBe(false);
      expect(/from "\w+:\/\//.test(code), `${path} imports a node built-in`).toBe(false);
      expect(/from "node:/.test(code), `${path} imports node:`).toBe(false);
      expect(/\bdocument\./.test(code), `${path} touches the DOM`).toBe(false);
      expect(/\bwindow\./.test(code), `${path} touches window`).toBe(false);
    }
  });

  test("only JSON and relative modules are imported", () => {
    for (const [path, source] of Object.entries(modules)) {
      const code = stripComments(source);
      const imports = [...code.matchAll(/from "([^"]+)"/g)].map((match) => match[1] as string);
      for (const target of imports) {
        const bare = !target.startsWith(".");
        const json = target.endsWith(".json");
        expect(bare && !json, `${path} imports bare "${target}"`).toBe(false);
      }
    }
  });
});

describe("the collision rule names no zone", () => {
  test("no zone key appears as a string in executable collision code", () => {
    const code = stripComments(modules["../src/sim/collision.ts"] ?? "");
    for (const key of ["farmhouse", "goshala", "orchard", "vegetable_beds", "pond", "compost", "gate"]) {
      expect(code.includes(`"${key}"`), `zone name "${key}" in collision.ts`).toBe(false);
    }
  });

  test("the rule really is decided from the walkable predicate", () => {
    const code = stripComments(modules["../src/sim/collision.ts"] ?? "");
    expect(code).toContain("isWalkable");
    const walkable = stripComments(modules["../src/sim/walkable.ts"] ?? "");
    expect(walkable).toContain("zone.solid");
    expect(walkable).toContain("movement.mode");
  });
});
