/*  A deliberately small JSON Schema validator.

    The brief asked for JSON Schema files for the two layout inputs, and the
    repository is not allowed new dependencies, so this covers the subset those
    two schemas actually use: type, required, properties, additionalProperties,
    items, minItems/maxItems, minimum/maximum, exclusiveMinimum/Maximum,
    enum, const, pattern, minLength/maxLength, allOf and oneOf.

    Anything outside that subset is ignored rather than silently "passing":
    `unsupportedKeywords` reports it, and a test asserts the two shipped schemas
    use nothing else. Pure: no DOM, no three, no node built-ins. */

export interface SchemaViolation {
  /** Dotted path to the offending value, starting at `$`. */
  path: string;
  message: string;
}

export type SchemaNode = Record<string, unknown>;

const SUPPORTED = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "type",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "enum",
  "const",
  "pattern",
  "minLength",
  "maxLength",
  "allOf",
  "oneOf",
]);

/** Keywords in a schema that this validator does not understand. */
export function unsupportedKeywords(schema: SchemaNode, path = "$"): string[] {
  const found: string[] = [];
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) found.push(`${path}.${key}`);
  }
  const properties = schema.properties as Record<string, SchemaNode> | undefined;
  if (properties) {
    for (const [key, child] of Object.entries(properties)) {
      found.push(...unsupportedKeywords(child, `${path}.properties.${key}`));
    }
  }
  const items = schema.items as SchemaNode | undefined;
  if (items) found.push(...unsupportedKeywords(items, `${path}.items`));
  const additional = schema.additionalProperties;
  if (additional && typeof additional === "object") {
    found.push(...unsupportedKeywords(additional as SchemaNode, `${path}.additionalProperties`));
  }
  for (const branch of ["allOf", "oneOf"] as const) {
    const list = schema[branch] as SchemaNode[] | undefined;
    for (const [index, child] of (list ?? []).entries()) {
      found.push(...unsupportedKeywords(child, `${path}.${branch}[${index}]`));
    }
  }
  return found;
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return typeOf(value) === "object";
    case "array":
      return Array.isArray(value);
    default:
      return typeOf(value) === type;
  }
}

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Validate `value` against `schema`, collecting every violation it finds. */
export function validateSchema(value: unknown, schema: SchemaNode, path = "$"): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  const report = (message: string): void => {
    violations.push({ path, message });
  };

  const type = schema.type;
  if (typeof type === "string" && !matchesType(value, type)) {
    report(`expected ${type}, found ${typeOf(value)}`);
    return violations;
  }
  if (Array.isArray(type) && !type.some((entry) => matchesType(value, entry as string))) {
    report(`expected one of ${(type as string[]).join(" | ")}, found ${typeOf(value)}`);
    return violations;
  }

  if (schema.const !== undefined && !equal(value, schema.const)) {
    report(`expected the constant ${JSON.stringify(schema.const)}, found ${JSON.stringify(value)}`);
  }
  const allowed = schema.enum as unknown[] | undefined;
  if (allowed && !allowed.some((entry) => equal(value, entry))) {
    report(`expected one of ${allowed.map((entry) => JSON.stringify(entry)).join(", ")}, found ${JSON.stringify(value)}`);
  }

  if (typeof value === "number") {
    const minimum = schema.minimum as number | undefined;
    const maximum = schema.maximum as number | undefined;
    const above = schema.exclusiveMinimum as number | undefined;
    const below = schema.exclusiveMaximum as number | undefined;
    if (minimum !== undefined && value < minimum) report(`expected at least ${minimum}, found ${value}`);
    if (maximum !== undefined && value > maximum) report(`expected at most ${maximum}, found ${value}`);
    if (above !== undefined && value <= above) report(`expected more than ${above}, found ${value}`);
    if (below !== undefined && value >= below) report(`expected less than ${below}, found ${value}`);
  }

  if (typeof value === "string") {
    const minLength = schema.minLength as number | undefined;
    const maxLength = schema.maxLength as number | undefined;
    const pattern = schema.pattern as string | undefined;
    if (minLength !== undefined && value.length < minLength) report(`expected at least ${minLength} characters`);
    if (maxLength !== undefined && value.length > maxLength) report(`expected at most ${maxLength} characters`);
    if (pattern !== undefined && !new RegExp(pattern).test(value)) report(`expected to match /${pattern}/, found "${value}"`);
  }

  if (Array.isArray(value)) {
    const minItems = schema.minItems as number | undefined;
    const maxItems = schema.maxItems as number | undefined;
    if (minItems !== undefined && value.length < minItems) report(`expected at least ${minItems} items, found ${value.length}`);
    if (maxItems !== undefined && value.length > maxItems) report(`expected at most ${maxItems} items, found ${value.length}`);
    const items = schema.items as SchemaNode | undefined;
    if (items) {
      for (const [index, entry] of value.entries()) {
        violations.push(...validateSchema(entry, items, `${path}[${index}]`));
      }
    }
  }

  if (typeOf(value) === "object") {
    const object = value as Record<string, unknown>;
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in object)) report(`missing required key "${key}"`);
    }
    const properties = (schema.properties as Record<string, SchemaNode> | undefined) ?? {};
    for (const [key, child] of Object.entries(properties)) {
      if (key in object) violations.push(...validateSchema(object[key], child, `${path}.${key}`));
    }
    const additional = schema.additionalProperties;
    if (additional === false) {
      for (const key of Object.keys(object)) {
        if (!(key in properties)) report(`unexpected key "${key}"`);
      }
    } else if (additional && typeof additional === "object") {
      for (const key of Object.keys(object)) {
        if (!(key in properties)) {
          violations.push(...validateSchema(object[key], additional as SchemaNode, `${path}.${key}`));
        }
      }
    }
  }

  for (const child of (schema.allOf as SchemaNode[] | undefined) ?? []) {
    violations.push(...validateSchema(value, child, path));
  }
  const oneOf = schema.oneOf as SchemaNode[] | undefined;
  if (oneOf) {
    const passing = oneOf.filter((child) => validateSchema(value, child, path).length === 0).length;
    if (passing !== 1) report(`expected exactly one of ${oneOf.length} alternatives to match, ${passing} did`);
  }

  return violations;
}
