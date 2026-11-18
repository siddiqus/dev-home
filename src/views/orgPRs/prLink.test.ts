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

  it.each(["cmp-server/pull/1234", "cmp-server/pull/1234/files#diff-1"])(
    "reads %s as a repo in the org",
    (text) => {
      expect(parsePRLink(text, "acme")).toEqual({ repo: "acme/cmp-server", number: 1234 });
    },
  );

  it("keeps an owner that's given, and still leaves text alone, with an org", () => {
    expect(parsePRLink("other/api/pull/9", "acme")).toEqual({ repo: "other/api", number: 9 });
    expect(parsePRLink("token refresh", "acme")).toBeNull();
    expect(parsePRLink("pull/12", "acme")).toBeNull();
  });
});
