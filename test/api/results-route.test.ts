import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/results/route";

describe("POST /api/results", () => {
  it("saves a result update", async () => {
    const response = await POST(
      new Request("http://localhost/api/results", {
        method: "POST",
        body: JSON.stringify({
          coupleId: "couple_001",
          category: "her_labs",
          note: "TSH 2.4 and progesterone 9.1",
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.extracted).toMatchObject({
      tsh: 2.4,
      mid_luteal_progesterone: 9.1,
    });
    expect(json.task.title).toBe("Review updated lab result with clinic");
  });

  it("rejects invalid updates", async () => {
    const response = await POST(
      new Request("http://localhost/api/results", {
        method: "POST",
        body: JSON.stringify({
          coupleId: "couple_001",
          category: "unknown",
          note: "nope",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
