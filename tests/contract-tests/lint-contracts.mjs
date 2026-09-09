import fs from "node:fs/promises";
import path from "node:path";

import SwaggerParser from "@apidevtools/swagger-parser";
import { DiagnosticSeverity, fromFile, Parser } from "@asyncapi/parser";

import { createAjv, diagnosticText, readJson, root } from "./contract-support.mjs";

const inventory = await readJson("contracts/contract-inventory.json");
const entries = [...inventory.canonicalContracts, ...inventory.foundationContracts];

for (const entry of entries) {
  await fs.access(path.join(root, entry.path));
}

const openapiEntries = inventory.canonicalContracts.filter((entry) => entry.kind === "openapi");
for (const entry of openapiEntries) {
  await SwaggerParser.validate(path.join(root, entry.path));
}

const asyncapiEntries = inventory.canonicalContracts.filter((entry) => entry.kind === "asyncapi");
for (const entry of asyncapiEntries) {
  const parsedAsyncApi = await fromFile(new Parser(), path.join(root, entry.path)).parse();
  const asyncApiErrors = parsedAsyncApi.diagnostics.filter(
    (diagnostic) => diagnostic.severity === DiagnosticSeverity.Error,
  );
  if (!parsedAsyncApi.document || asyncApiErrors.length > 0) {
    throw new Error(
      `${entry.path} AsyncAPI validation failed:\n${asyncApiErrors.map(diagnosticText).join("\n")}`,
    );
  }
}

const schemaEntries = entries.filter((entry) => entry.kind === "json-schema");
for (const entry of schemaEntries) {
  createAjv().compile(await readJson(entry.path));
}

for (const example of inventory.examples) {
  await fs.access(path.join(root, example.path));
  if (!new Set(["valid", "invalid"]).has(example.expected)) {
    throw new Error(`Unknown example expectation: ${example.expected}`);
  }
}

const invalidFoundationEntries = inventory.foundationContracts.filter(
  (entry) => entry.lifecycle !== "DRAFT" || entry.runtimeConsumption !== "NOT_CONSUMED_BY_RUNTIME",
);
if (invalidFoundationEntries.length > 0) {
  throw new Error("Foundation contracts must remain DRAFT / NOT_CONSUMED_BY_RUNTIME");
}

console.log(
  `contract:lint PASS (OpenAPI=${openapiEntries.length}, AsyncAPI=${asyncapiEntries.length}, JSON Schema=${schemaEntries.length}, inventory entries=${entries.length})`,
);
