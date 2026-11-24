import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const artifacts = ["content.js", "greenhouse.js"];

for (const artifact of artifacts) {
  const artifactPath = path.resolve(process.cwd(), "dist", artifact);
  assert.ok(fs.existsSync(artifactPath), `Missing built content script: ${artifact}`);
  const source = fs.readFileSync(artifactPath, "utf8");
  try {
    new vm.Script(source, { filename: artifact });
  } catch (error) {
    throw new Error(
      `${artifact} is not valid as a classic MV3 content script.`,
      { cause: error }
    );
  }
}

console.log("Classic content script artifact check passed.");
