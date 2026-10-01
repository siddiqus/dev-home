import { describe, it, expect } from "vitest";
import { ApiError, toApiError } from "./errors";

describe("ApiError", () => {
  it("constructs with message and status", () => {
    const err = new ApiError(404, "nope");
    expect(err.message).toBe("nope");
    expect(err.status).toBe(404);
    expect(err.response.status).toBe(404);
    expect(err.response.data.error).toBe("nope");
    expect(err instanceof Error).toBe(true);
  });
});

describe("toApiError", () => {
  it("returns same instance when given an ApiError", () => {
    const err = new ApiError(500, "original");
    expect(toApiError(err)).toBe(err);
  });

  it("picks response.data.error when present", () => {
    const err = {
      message: "outer",
      response: { status: 400, data: { error: "inner error" } },
    };
    const result = toApiError(err);
    expect(result.message).toBe("inner error");
    expect(result.status).toBe(400);
  });

  it("picks response.data.errorMessages[0] when error is absent", () => {
    const err = {
      message: "outer",
      response: { status: 422, data: { errorMessages: ["first msg", "second msg"] } },
    };
    const result = toApiError(err);
    expect(result.message).toBe("first msg");
    expect(result.status).toBe(422);
  });

  it("picks response.data.message when error and errorMessages are absent", () => {
    const err = {
      message: "outer",
      response: { status: 403, data: { message: "data message" } },
    };
    const result = toApiError(err);
    expect(result.message).toBe("data message");
    expect(result.status).toBe(403);
  });

  it("falls back to err.message when response.data has no known field", () => {
    const err = {
      message: "fallback message",
      response: { status: 500, data: {} },
    };
    const result = toApiError(err);
    expect(result.message).toBe("fallback message");
    expect(result.status).toBe(500);
  });

  it("uses status 0 when there is no response", () => {
    const err = { message: "network failure" };
    const result = toApiError(err);
    expect(result.status).toBe(0);
    expect(result.message).toBe("network failure");
  });

  it("handles unknown errors gracefully", () => {
    const result = toApiError(null);
    expect(result.status).toBe(0);
    expect(result.message).toBe("Request failed");
  });
});
