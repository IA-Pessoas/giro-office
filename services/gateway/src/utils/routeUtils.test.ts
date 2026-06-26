import { describe, expect, it } from "vitest";

import { isUserServiceRoute } from "./routeUtils.js";

describe("isUserServiceRoute", () => {
  it("recognizes the public user-service prefix", () => {
    expect(isUserServiceRoute("/user")).toBe(true);
    expect(isUserServiceRoute("/user/me")).toBe(true);
    expect(isUserServiceRoute("/user/permission/user-1")).toBe(true);
  });
});
