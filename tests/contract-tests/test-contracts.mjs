import SwaggerParser from "@apidevtools/swagger-parser";
import { DiagnosticSeverity, fromFile, Parser } from "@asyncapi/parser";

import { createAjv, problemDetailsSchema, readJson, readYaml } from "./contract-support.mjs";

const inventory = await readJson("contracts/contract-inventory.json");
const eventSchema = await readJson("contracts/json-schema/event-envelope-v1.schema.json");
const sseEventSchema = await readJson("contracts/json-schema/m1-sse-event.schema.json");
const rawTelemetrySchema = await readJson("contracts/json-schema/b02-telemetry-raw.schema.json");
const normalizedTelemetrySchema = await readJson(
  "contracts/json-schema/b02-telemetry-normalized.schema.json",
);
const ptzClientSchema = await readJson("contracts/json-schema/ptz-client-message-v1.schema.json");
const ptzServerSchema = await readJson("contracts/json-schema/ptz-server-message-v1.schema.json");
const openapi = await readYaml("contracts/openapi/fieldops-m1-ui.yaml");
const asyncapi = await readYaml("contracts/asyncapi/fieldops-m1-realtime.yaml");
const cameraOpenapi = await readYaml("contracts/openapi/fieldops-m2-camera.yaml");
const cameraAsyncapi = await readYaml("contracts/asyncapi/fieldops-camera-control-v1.yaml");
const problemSchema = problemDetailsSchema(openapi);
const englishCopy = await readJson("contracts/ui/m1-copy.en.json");
const koreanCopy = await readJson("contracts/ui/m1-copy.ko.json");

function leafKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

const englishCopyKeys = leafKeys(englishCopy).sort();
const koreanCopyKeys = leafKeys(koreanCopy).sort();
if (JSON.stringify(englishCopyKeys) !== JSON.stringify(koreanCopyKeys)) {
  throw new Error("Korean and English UI copy catalogs must have exact key parity");
}
for (const [locale, catalog] of [["en", englishCopy], ["ko", koreanCopy]]) {
  const missingValues = leafKeys(catalog).filter((key) => {
    const value = key.split(".").reduce((current, part) => current?.[part], catalog);
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missingValues.length > 0) {
    throw new Error(`${locale} UI copy catalog has empty/non-string leaves: ${missingValues.join(", ")}`);
  }
}

const validators = {
  "event-envelope-v1": createAjv().compile(eventSchema),
  "b02-telemetry-raw": createAjv().compile(rawTelemetrySchema),
  "b02-telemetry-normalized": createAjv().compile(normalizedTelemetrySchema),
  "b04-ptz-client-message": createAjv().compile(ptzClientSchema),
  "b04-ptz-server-message": createAjv().compile(ptzServerSchema),
  "problem-details-from-m1-openapi": createAjv().compile(problemSchema),
};

let accepted = 0;
let rejected = 0;
for (const example of inventory.examples) {
  const validator = validators[example.contract];
  if (!validator) throw new Error(`No validator mapped for ${example.contract}`);

  const actual = validator(await readJson(example.path));
  const expected = example.expected === "valid";
  if (actual !== expected) {
    throw new Error(
      `${example.path}: expected ${example.expected}; errors=${JSON.stringify(validator.errors)}`,
    );
  }
  expected ? accepted++ : rejected++;
}

const openapiWithBrokenReference = structuredClone(openapi);
openapiWithBrokenReference.paths["/api/v1/session"].get.responses["200"].content[
  "application/json"
].schema.$ref = "#/components/schemas/MissingByNegativeTest";
let openapiBrokenReferenceRejected = false;
try {
  await SwaggerParser.validate(openapiWithBrokenReference);
} catch {
  openapiBrokenReferenceRejected = true;
}
if (!openapiBrokenReferenceRejected) {
  throw new Error("OpenAPI validator accepted an in-memory missing reference");
}

await SwaggerParser.validate(structuredClone(cameraOpenapi));
const cameraOperationIds = Object.values(cameraOpenapi.paths).flatMap((pathItem) =>
  Object.values(pathItem)
    .filter((operation) => operation && typeof operation === "object" && operation.operationId)
    .map((operation) => operation.operationId),
);
if (cameraOpenapi.info.version !== "1.0.0" || cameraOperationIds.length !== 5) {
  throw new Error("M2 camera OpenAPI must expose five unique version 1.0.0 operations");
}
if (new Set(cameraOperationIds).size !== cameraOperationIds.length) {
  throw new Error("M2 camera OpenAPI operationIds must be unique");
}
for (const pathName of Object.keys(cameraOpenapi.paths)) {
  for (const operation of Object.values(cameraOpenapi.paths[pathName])) {
    if (!operation || typeof operation !== "object" || !operation.operationId) continue;
    const parameters = operation.parameters ?? [];
    if (!parameters.some((parameter) => parameter.$ref === "#/components/parameters/TenantId")) {
      throw new Error(`${pathName} must require tenantId`);
    }
  }
}
const acquire = cameraOpenapi.paths["/api/v1/cameras/{cameraId}/control-sessions"].post;
const release = cameraOpenapi.paths["/api/v1/cameras/{cameraId}/control-sessions/{sessionId}"].delete;
for (const operation of [acquire, release]) {
  if (
    JSON.stringify(operation["x-fieldops-ui"].permissions) !== JSON.stringify(["CAMERA_CONTROL"]) ||
    !operation.parameters.some((parameter) => parameter.$ref === "#/components/parameters/CsrfToken")
  ) {
    throw new Error("Control lease mutations must require CAMERA_CONTROL and CSRF");
  }
}
for (const operationId of ["listCameras", "getCamera", "getCameraStatus"]) {
  const operation = Object.values(cameraOpenapi.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .find((candidate) => candidate?.operationId === operationId);
  if (JSON.stringify(operation["x-fieldops-ui"].permissions) !== JSON.stringify(["CAMERA_READ"])) {
    throw new Error(`${operationId} must require CAMERA_READ`);
  }
}

const parsedCameraAsyncApi = await fromFile(
  new Parser(),
  "contracts/asyncapi/fieldops-camera-control-v1.yaml",
).parse();
const cameraAsyncErrors = parsedCameraAsyncApi.diagnostics.filter(
  (diagnostic) => diagnostic.severity === DiagnosticSeverity.Error,
);
if (!parsedCameraAsyncApi.document || cameraAsyncErrors.length > 0) {
  throw new Error(`B04 AsyncAPI did not parse cleanly: ${JSON.stringify(cameraAsyncErrors)}`);
}
if (
  cameraAsyncapi.info.version !== "1.0.0" ||
  cameraAsyncapi.channels.cameraPtz.address !== "/cameras/{cameraId}/ptz" ||
  !/never sent to\s+Kafka/.test(cameraAsyncapi.info.description)
) {
  throw new Error("B04 AsyncAPI changed its channel, version, or non-durable boundary");
}

const invalidPtzMutations = [
  ["zero generation", (message) => (message.generation = 0)],
  ["zero sequence", (message) => (message.seq = 0)],
  ["out-of-range pan", (message) => (message.pan = 1.1)],
  ["device timeout over 500ms", (message) => (message.timeoutMs = 501)],
  ["unknown property", (message) => (message.replay = true)],
];
const validMove = await readJson("contracts/examples/b04/ptz-client-move-valid.json");
const validatePtzClient = createAjv().compile(ptzClientSchema);
for (const [label, mutate] of invalidPtzMutations) {
  const candidate = structuredClone(validMove);
  mutate(candidate);
  if (validatePtzClient(candidate)) throw new Error(`PTZ client schema accepted ${label}`);
}

const eventWithBrokenReference = structuredClone(eventSchema);
eventWithBrokenReference.properties.payload = { $ref: "#/$defs/MissingByNegativeTest" };
let schemaBrokenReferenceRejected = false;
try {
  createAjv().compile(eventWithBrokenReference);
} catch {
  schemaBrokenReferenceRejected = true;
}
if (!schemaBrokenReferenceRejected) {
  throw new Error("JSON Schema validator accepted an in-memory missing reference");
}

const streamChannel = asyncapi.channels.siteEvents;
const streamOperation = openapi.paths["/api/v1/events/stream"].get;
const siteIdParameter = openapi.components.parameters.SiteId;
const tenantIdParameter = openapi.components.parameters.TenantId;
const expectedMessageReferences = [
  "#/components/messages/DeviceStateUpdated",
  "#/components/messages/DeviceLifecycleChanged",
  "#/components/messages/SnapshotRequired",
  "#/components/messages/Heartbeat",
];
const actualMessageReferences = Object.values(streamChannel.messages).map((message) => message.$ref);

if (openapi.info.version !== "2.0.0") {
  throw new Error("OpenAPI contract version must be 2.0.0");
}
const operationIds = Object.values(openapi.paths).flatMap((pathItem) =>
  Object.values(pathItem)
    .filter((operation) => operation && typeof operation === "object" && operation.operationId)
    .map((operation) => operation.operationId),
);
if (operationIds.length !== 13 || new Set(operationIds).size !== 13) {
  throw new Error(`OpenAPI must expose 13 unique B02 operations; found ${operationIds.length}`);
}
const tenantOwnedPaths = [
  "/api/v1/dashboard/overview",
  "/api/v1/dashboard/environment-series",
  "/api/v1/devices",
  "/api/v1/devices/{deviceId}",
  "/api/v1/devices/{deviceId}/state",
  "/api/v1/devices/{deviceId}/telemetry/series",
  "/api/v1/members",
  "/api/v1/events/stream",
];
for (const pathName of tenantOwnedPaths) {
  const parameters = openapi.paths[pathName].get.parameters ?? [];
  if (!parameters.some((parameter) => parameter.$ref === "#/components/parameters/TenantId")) {
    throw new Error(`${pathName} must require the canonical tenantId query parameter`);
  }
}
if ((openapi.paths["/api/v1/session"].get.parameters ?? []).length > 0) {
  throw new Error("Session bootstrap must not accept tenantId as authority");
}

if (asyncapi.info.version !== "2.0.0" || streamChannel.address !== "/api/v1/events/stream") {
  throw new Error("AsyncAPI erratum changed the contract version or SSE channel address");
}
if (streamChannel.parameters !== undefined) {
  throw new Error("AsyncAPI fixed-address channel retained an address parameter declaration");
}
if (JSON.stringify(actualMessageReferences) !== JSON.stringify(expectedMessageReferences)) {
  throw new Error("AsyncAPI erratum changed the siteEvents message references");
}
if (
  siteIdParameter.name !== "siteId" ||
  siteIdParameter.in !== "query" ||
  siteIdParameter.required !== true ||
  !streamOperation.parameters.some((parameter) => parameter.$ref === "#/components/parameters/SiteId") ||
  tenantIdParameter.name !== "tenantId" ||
  tenantIdParameter.in !== "query" ||
  tenantIdParameter.required !== true ||
  !streamOperation.parameters.some((parameter) => parameter.$ref === "#/components/parameters/TenantId") ||
  JSON.stringify(streamOperation["x-fieldops-ui"].permissions) !==
    JSON.stringify(["OVERVIEW_READ", "DEVICE_READ", "TELEMETRY_READ"])
) {
  throw new Error("AsyncAPI erratum changed the required HTTP site query or permission contract");
}
const eventRequired = asyncapi.components.schemas.BaseEvent.required;
if (
  !eventRequired.includes("tenantId") ||
  !eventRequired.includes("siteId") ||
  !eventRequired.includes("stateEpoch") ||
  !eventRequired.includes("revision")
) {
  throw new Error("AsyncAPI erratum changed required tenant/site payload fields");
}

const parsedCorrectedAsyncApi = await new Parser().parse(asyncapi);
const correctedErrors = parsedCorrectedAsyncApi.diagnostics.filter(
  (diagnostic) => diagnostic.severity === DiagnosticSeverity.Error,
);
if (!parsedCorrectedAsyncApi.document || correctedErrors.length > 0) {
  throw new Error(`Corrected AsyncAPI did not parse cleanly: ${JSON.stringify(correctedErrors)}`);
}

const priorInvalidAsyncApi = structuredClone(asyncapi);
priorInvalidAsyncApi.channels.siteEvents.parameters = {
  siteId: { description: "Site selected from the authenticated session scope." },
};
const parsedPriorInvalidAsyncApi = await new Parser().parse(priorInvalidAsyncApi);
const redundantParameterDiagnostic = parsedPriorInvalidAsyncApi.diagnostics.find(
  (diagnostic) =>
    diagnostic.severity === DiagnosticSeverity.Error &&
    diagnostic.code === "asyncapi3-channel-parameters" &&
    diagnostic.path?.join(".") === "channels.siteEvents.parameters.siteId",
);
if (!redundantParameterDiagnostic) {
  throw new Error("AsyncAPI parser did not reject the prior redundant siteId channel parameter");
}

const sseValidator = createAjv().compile(sseEventSchema);
const sseFixturePaths = [
  "fixtures/m1/realtime/device-state-updated.json",
  "fixtures/m1/realtime/device-lifecycle-changed.json",
  "fixtures/m1/realtime/snapshot-required.json",
  "fixtures/m1/realtime/heartbeat.json",
];
const sseFixtures = await Promise.all(sseFixturePaths.map((fixturePath) => readJson(fixturePath)));
for (const [index, fixture] of sseFixtures.entries()) {
  if (!sseValidator(fixture)) {
    throw new Error(
      `${sseFixturePaths[index]}: expected valid SSE event; errors=${JSON.stringify(sseValidator.errors)}`,
    );
  }
}

const stateEvent = sseFixtures[0];
const acceptedMetricValues = [7, 7.25, true, false, "", "nominal", null];
for (const value of acceptedMetricValues) {
  const candidate = structuredClone(stateEvent);
  candidate.payload.metrics[0].value = value;
  if (!sseValidator(candidate)) {
    throw new Error(
      `metric.value rejected allowed scalar ${JSON.stringify(value)}: ${JSON.stringify(sseValidator.errors)}`,
    );
  }
}

const rejectedMetricValues = [{ nested: true }, [1, 2]];
for (const value of rejectedMetricValues) {
  const candidate = structuredClone(stateEvent);
  candidate.payload.metrics[0].value = value;
  if (sseValidator(candidate)) {
    throw new Error(`metric.value accepted non-scalar ${JSON.stringify(value)}`);
  }
}

const invalidSseMutations = [
  ["missing tenantId", (event) => delete event.tenantId],
  ["missing siteId", (event) => delete event.siteId],
  ["missing payload", (event) => delete event.payload],
  ["missing stateEpoch", (event) => delete event.stateEpoch],
  ["missing revision", (event) => delete event.revision],
  ["unknown top-level property", (event) => (event.unknown = true)],
  ["unknown payload property", (event) => (event.payload.unknown = true)],
  ["wrong event/resource pair", (event) => (event.resourceType = "SITE")],
  ["invalid version", (event) => (event.version = -1)],
  ["invalid revision", (event) => (event.revision = 0)],
  ["invalid occurredAt", (event) => (event.occurredAt = "not-a-date")],
];
for (const [label, mutate] of invalidSseMutations) {
  const candidate = structuredClone(stateEvent);
  mutate(candidate);
  if (sseValidator(candidate)) {
    throw new Error(`SSE validator accepted ${label}`);
  }
}

function expectStrictCompileFailure(schema, pattern, label) {
  try {
    createAjv().compile(schema);
  } catch (error) {
    if (pattern.test(String(error))) return;
    throw new Error(`${label} failed for an unexpected reason: ${error}`);
  }
  throw new Error(`${label} compiled successfully`);
}

const missingLocalObjectTypes = structuredClone(sseEventSchema);
for (const definition of [
  "deviceStateUpdated",
  "deviceLifecycleChanged",
  "snapshotRequired",
  "heartbeat",
]) {
  delete missingLocalObjectTypes.$defs[definition].allOf[1].type;
}
expectStrictCompileFailure(
  missingLocalObjectTypes,
  /missing type "object".*strictTypes/,
  "prior event allOf expression",
);

const priorMetricUnion = structuredClone(sseEventSchema);
const metricValue = priorMetricUnion.$defs.metric.properties.value;
delete metricValue.anyOf;
metricValue.type = ["number", "boolean", "string", "null"];
expectStrictCompileFailure(
  priorMetricUnion,
  /allowUnionTypes.*strictTypes/,
  "prior metric.value union expression",
);

console.log(
  `contract:test PASS (positive=${accepted}, negative=${rejected}, broken-reference=2 rejected, channel-erratum=1 regression, SSE fixtures=${sseFixtures.length}, metric scalars=${acceptedMetricValues.length} accepted/${rejectedMetricValues.length} rejected, SSE constraints=${invalidSseMutations.length} rejected, schema-mutants=2 rejected)`,
);
