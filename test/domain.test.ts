import { describe, expect, it } from "vitest";
import { safeReturnURL, siteDomain } from "../src/domain";

const BASE = "https://id.skyda.dev";
const HOME = "https://skyda.dev/";

describe("siteDomain", () => {
  it("drops the id label", () => {
    expect(siteDomain(BASE)).toBe("skyda.dev");
    expect(siteDomain("http://localhost:8787")).toBe("localhost");
  });
});

describe("safeReturnURL", () => {
  it.each([
    ["https://skyda.dev/", "https://skyda.dev/"],
    ["https://dotforge.skyda.dev/a?b=1#c", "https://dotforge.skyda.dev/a?b=1#c"],
    ["https://id.skyda.dev/sign-in", "https://id.skyda.dev/sign-in"],
  ])("keeps %s", (input, expected) => {
    expect(safeReturnURL(input, BASE)).toBe(expected);
  });

  it.each([
    undefined,
    "",
    "/relative",
    "https://evil.example/",
    "https://skyda.dev.evil.example/",
    "https://evilskyda.dev/",
    "http://skyda.dev/",
    "javascript:alert(1)",
    "https://user:pass@skyda.dev/",
  ])("replaces %s with the home page", (input) => {
    expect(safeReturnURL(input, BASE)).toBe(HOME);
  });
});
