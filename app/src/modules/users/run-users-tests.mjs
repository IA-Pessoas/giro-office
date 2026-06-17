import assert from "node:assert/strict";

import {
  buildCreateUserModulesPayload,
  resolveCreateUserRhModuleLevel,
} from "./utils/createUserModules.ts";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function createModuleSelections(overrides = {}) {
  return {
    fiscal: { enabled: false, level: 0 },
    rh: { enabled: false, level: 0 },
    ti: { enabled: false, level: 0 },
    ...overrides,
  };
}

await (async () => {
  await runTest("create user modules grant RH self-service by default", () => {
    assert.deepEqual(buildCreateUserModulesPayload(createModuleSelections()), {
      rh: 1,
    });
  });

  await runTest("create user modules grant RH management for RH department users", () => {
    assert.deepEqual(buildCreateUserModulesPayload(createModuleSelections(), "rh"), {
      rh: 2,
    });
  });

  await runTest("create user modules keep explicit RH management outside RH department", () => {
    assert.deepEqual(
      buildCreateUserModulesPayload(
        createModuleSelections({
          rh: { enabled: true, level: 2 },
        }),
        "fiscal",
      ),
      {
        rh: 2,
      },
    );
  });

  await runTest("create user modules never create RH visualizer-only users", () => {
    assert.equal(
      resolveCreateUserRhModuleLevel({
        departmentModuleKey: "fiscal",
        selectedRhLevel: 0,
      }),
      1,
    );
  });

  await runTest("create user modules still omit the non-RH department module", () => {
    assert.deepEqual(
      buildCreateUserModulesPayload(
        createModuleSelections({
          fiscal: { enabled: true, level: 2 },
          ti: { enabled: true, level: 1 },
        }),
        "fiscal",
      ),
      {
        ti: 1,
        rh: 1,
      },
    );
  });
})();
