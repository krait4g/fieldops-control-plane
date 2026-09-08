import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse as parseYaml } from "yaml";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), "utf8"));
}

export async function readYaml(relativePath) {
  return parseYaml(await fs.readFile(path.join(root, relativePath), "utf8"));
}

export function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}

export function problemDetailsSchema(openapi) {
  const components = openapi?.components?.schemas;
  if (!components?.ProblemDetails || !components?.FieldError) {
    throw new Error("Frozen OpenAPI is missing ProblemDetails or FieldError");
  }

  const schema = structuredClone(components.ProblemDetails);
  schema.$schema = "https://json-schema.org/draft/2020-12/schema";
  schema.$defs = { FieldError: structuredClone(components.FieldError) };
  if (schema.properties?.fieldErrors?.items?.$ref === "#/components/schemas/FieldError") {
    schema.properties.fieldErrors.items.$ref = "#/$defs/FieldError";
  }
  return schema;
}

export function diagnosticText(diagnostic) {
  const location = diagnostic.path?.length ? diagnostic.path.join(".") : "document";
  return `${location}: ${diagnostic.message}`;
}
