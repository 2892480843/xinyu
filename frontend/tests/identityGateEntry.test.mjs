import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("first-time visitors can enter without typing a nickname", () => {
  const gate = read("../src/components/IdentityGate.tsx");
  const identity = read("../src/lib/localIdentity.ts");

  assert.match(identity, /export const DEFAULT_NICKNAME = "岛屿访客"/);
  assert.match(identity, /cleanNickname\(nickname\) \|\| DEFAULT_NICKNAME/);
  assert.match(gate, /createIdentity\(nickname\)/);
  assert.match(gate, /留空会使用/);
  assert.match(gate, /placeholder=\{`留空默认：\$\{DEFAULT_NICKNAME\}`\}/);
  assert.doesNotMatch(gate, /if \(!next\) return/);
  assert.doesNotMatch(gate, /disabled=\{!nickname\.trim\(\)\}/);
});
