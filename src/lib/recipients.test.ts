import { describe, expect, it } from "vitest";
import { isValidEmail, mergeEmails, parseEmailList } from "./recipients";

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
  });

  it("rejects text with no @", () => {
    expect(isValidEmail("alice.example.com")).toBe(false);
  });

  it("rejects a domain with no dot", () => {
    expect(isValidEmail("alice@example")).toBe(false);
  });

  it("rejects an address containing whitespace", () => {
    expect(isValidEmail("ali ce@example.com")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });
});

describe("parseEmailList", () => {
  it("splits on newlines", () => {
    expect(parseEmailList("a@x.com\nb@x.com")).toEqual(["a@x.com", "b@x.com"]);
  });

  it("splits on commas and semicolons", () => {
    expect(parseEmailList("a@x.com, b@x.com; c@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });

  it("lowercases and trims", () => {
    expect(parseEmailList("  Alice@Example.COM  ")).toEqual([
      "alice@example.com",
    ]);
  });

  it("drops empty fragments from trailing separators", () => {
    expect(parseEmailList("a@x.com,\n\n,")).toEqual(["a@x.com"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseEmailList("   \n  ")).toEqual([]);
  });
});

describe("mergeEmails", () => {
  it("appends new addresses after existing ones", () => {
    const result = mergeEmails(["a@x.com"], ["b@x.com"]);
    expect(result.merged).toEqual(["a@x.com", "b@x.com"]);
    expect(result.added).toEqual(["b@x.com"]);
    expect(result.invalid).toEqual([]);
  });

  it("does not re-add an address already present", () => {
    const result = mergeEmails(["a@x.com"], ["a@x.com"]);
    expect(result.merged).toEqual(["a@x.com"]);
    expect(result.added).toEqual([]);
  });

  it("de-duplicates within the incoming batch", () => {
    const result = mergeEmails([], ["a@x.com", "a@x.com"]);
    expect(result.merged).toEqual(["a@x.com"]);
    expect(result.added).toEqual(["a@x.com"]);
  });

  it("separates invalid addresses instead of merging them", () => {
    const result = mergeEmails([], ["a@x.com", "nope"]);
    expect(result.merged).toEqual(["a@x.com"]);
    expect(result.invalid).toEqual(["nope"]);
  });

  it("leaves existing untouched when incoming is empty", () => {
    const result = mergeEmails(["a@x.com"], []);
    expect(result.merged).toEqual(["a@x.com"]);
    expect(result.added).toEqual([]);
  });
});
