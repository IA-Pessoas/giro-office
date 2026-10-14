import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, nitroHoursServiceMock, resetRhRouteMocks } from "./rhTestUtils.js";

describe("nitroHours routes", () => {
  beforeEach(() => resetRhRouteMocks());

  it("submits a certificate with the authenticated organization and quarter", async () => {
    const app = createTestApp();
    const response = await request(app)
      .post("/rh/score/nitro/hours/submissions")
      .field("quarter", "2026-Q3")
      .field("hours", "10")
      .attach("certificate", Buffer.from("%PDF-1.7\n"), {
        filename: "certificate.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(201);
    expect(nitroHoursServiceMock.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "00000000-0000-4000-8000-000000000002",
        user_id: "00000000-0000-4000-8000-000000000001",
        quarter: "2026-Q3",
        hours: 10,
      }),
    );
  });

  it("requires a certificate on every submission", async () => {
    const response = await request(createTestApp())
      .post("/rh/score/nitro/hours/submissions")
      .field("quarter", "2026-Q3")
      .field("hours", "10");

    expect(response.status).toBe(400);
    expect(nitroHoursServiceMock.submit).not.toHaveBeenCalled();
  });

  it("returns the accepted quarterly summary for the authenticated employee", async () => {
    const response = await request(createTestApp()).get(
      "/rh/score/nitro/hours/summary?quarter=2026-Q3",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ accepted_hours: 10, nitro_bonus: 1 });
    expect(nitroHoursServiceMock.acceptedHours).toHaveBeenCalledWith({
      organization_id: "00000000-0000-4000-8000-000000000002",
      quarter: "2026-Q3",
      user_id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("requires management permission to decide a submission", async () => {
    const response = await request(createTestApp({ rhPermission: 1 }))
      .patch("/rh/score/nitro/hours/submissions/00000000-0000-4000-8000-000000000003/decision")
      .send({ status: "Accepted" });

    expect(response.status).toBe(403);
    expect(nitroHoursServiceMock.decide).not.toHaveBeenCalled();
  });

  it("validates decision status and requires a reason to reject", async () => {
    const route = "/rh/score/nitro/hours/submissions/00000000-0000-4000-8000-000000000003/decision";
    const invalidStatus = await request(createTestApp()).patch(route).send({ status: "Pending" });
    const missingReason = await request(createTestApp()).patch(route).send({ status: "Rejected" });

    expect(invalidStatus.status).toBe(400);
    expect(missingReason.status).toBe(400);
    expect(nitroHoursServiceMock.decide).not.toHaveBeenCalled();
  });

  it("passes an authorized decision to the service", async () => {
    const response = await request(createTestApp())
      .patch("/rh/score/nitro/hours/submissions/00000000-0000-4000-8000-000000000003/decision")
      .send({ status: "Accepted" });

    expect(response.status).toBe(200);
    expect(nitroHoursServiceMock.decide).toHaveBeenCalledWith({
      organization_id: "00000000-0000-4000-8000-000000000002",
      request_id: "00000000-0000-4000-8000-000000000003",
      actor_user_id: "00000000-0000-4000-8000-000000000001",
      status: "Accepted",
    });
  });
});
