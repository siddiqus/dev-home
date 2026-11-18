import { describe, it, expect } from "vitest";
import { parsePRLink } from "./prLink";

describe("parsePRLink", () => {
  const pr = { repo: "acme/api", number: 812 };

  it.each([
    "https://github.com/acme/api/pull/812",
    "  https://github.com/acme/api/pull/812/files?w=1#diff-abc ",
    "http://www.github.com/acme/api/pull/812",
    "github.com/acme/api/pull/812",
    "www.github.com/acme/api/pull/812/commits",
    "acme/api/pull/812",
    "acme/api#812",
  ])("reads %s", (text) => {
    expect(parsePRLink(text)).toEqual(pr);
  });

  it.each([
    "",
    "token refresh",
    "label:bug sso",
    "CMP-123",
    "https://github.com/acme/api/issues/812",
    "https://gitlab.com/acme/api/pull/812",
    "api/pull/812",
    "acme/api/pull/812 extra words",
  ])("leaves %s as search text", (text) => {
    expect(parsePRLink(text)).toBeNull();
  });
});
