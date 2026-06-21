import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";
import { fc, MIN_RUNS, propertyConfig } from "./property";

describe("toolchain smoke", () => {
  it("runs unit tests with vitest", () => {
    expect(cn("a", "b")).toBe("a b");
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("runs property tests with fast-check (min 100 cases)", () => {
    fc.assert(
      fc.property(fc.integer(), (n) => n + 0 === n),
      propertyConfig(),
    );
    expect(MIN_RUNS).toBeGreaterThanOrEqual(100);
  });
});
