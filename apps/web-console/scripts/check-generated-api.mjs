import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript";

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.resolve(packageDirectory, "../../contracts/openapi/fieldops-m1-ui.yaml");
const committedPath = path.resolve(
  packageDirectory,
  "src/shared/api/generated/fieldops-m1.d.ts",
);

function normalize(text) {
  return text.replace(/\r\n?/g, "\n");
}

let temporaryDirectory;
try {
  temporaryDirectory = await mkdtemp(path.join(tmpdir(), "fieldops-openapi-"));
  const temporaryPath = path.join(temporaryDirectory, "fieldops-m1.d.ts");
  const syntaxTree = await openapiTS(pathToFileURL(contractPath));
  await writeFile(temporaryPath, COMMENT_HEADER + astToString(syntaxTree), "utf8");

  const [generated, committed] = await Promise.all([
    readFile(temporaryPath, "utf8"),
    readFile(committedPath, "utf8"),
  ]);
  if (normalize(generated) !== normalize(committed)) {
    console.error(
      "Generated API types differ from the frozen OpenAPI contract. Run pnpm generate:api and commit the result.",
    );
    process.exitCode = 1;
  } else {
    console.log("Generated API types match the frozen OpenAPI contract.");
  }
} finally {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
