import { describe, it } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { expect } from "https://deno.land/std@0.208.0/expect/mod.ts";
import { calculateLastActivityAt } from "./retention.ts";

describe("calculateLastActivityAt", () => {
  it("retient la date la plus recente", () => {
    const result = calculateLastActivityAt({
      lastSignInAt: "2020-01-01T00:00:00.000Z",
      profileUpdatedAt: "2022-05-01T10:00:00.000Z",
      analyticsLastActivityAt: "2021-03-10T08:00:00.000Z",
      createdAt: "2019-01-01T00:00:00.000Z",
    });

    expect(result?.toISOString()).toBe("2022-05-01T10:00:00.000Z");
  });

  it("fallback sur createdAt si aucune autre source", () => {
    const result = calculateLastActivityAt({
      lastSignInAt: null,
      profileUpdatedAt: null,
      analyticsLastActivityAt: null,
      createdAt: "2023-02-01T12:00:00.000Z",
    });

    expect(result?.toISOString()).toBe("2023-02-01T12:00:00.000Z");
  });

  it("retourne null si aucune date n'est valide", () => {
    const result = calculateLastActivityAt({
      lastSignInAt: null,
      profileUpdatedAt: null,
      analyticsLastActivityAt: null,
      createdAt: null,
    });

    expect(result).toBeNull();
  });
});
