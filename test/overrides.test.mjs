import assert from "node:assert/strict";
import test from "node:test";
import { applyOverrides, validateOverrideCoverage, validateOverrides } from "../src/overrides.mjs";

const override = {
  schemaVersion: 1,
  overrides: [{
    sourcePath: "skills/lark-shared/SKILL.md",
    firstSeenCommit: "abc123",
    reason: "Conflicts with wrapper policy.",
    match: "run unsafe update",
    replacement: "use wrapper update",
  }],
};

test("applies an exact upstream policy override", () => {
  const result = applyOverrides("before\nrun unsafe update\nafter\n", "skills/lark-shared/SKILL.md", override);
  assert.equal(result.content, "before\nuse wrapper update\nafter\n");
  assert.deepEqual(result.applied, ["skills/lark-shared/SKILL.md"]);
});

test("leaves unrelated files unchanged", () => {
  const result = applyOverrides("run unsafe update", "skills/lark-calendar/SKILL.md", override);
  assert.equal(result.content, "run unsafe update");
  assert.deepEqual(result.applied, []);
});

test("rejects stale and ambiguous override matches", () => {
  assert.throws(() => applyOverrides("no longer present", "skills/lark-shared/SKILL.md", override), /found 0/);
  assert.throws(() => applyOverrides("run unsafe update and run unsafe update", "skills/lark-shared/SKILL.md", override), /found 2/);
});

test("rejects absent targets and duplicate path rules", () => {
  assert.throws(() => validateOverrideCoverage(["skills/lark-calendar/SKILL.md"], override), /absent from upstream/);
  assert.throws(
    () => validateOverrides({ ...override, overrides: [...override.overrides, { ...override.overrides[0] }] }),
    /one consolidated override/,
  );
});
