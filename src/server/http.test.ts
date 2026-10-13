import { describe, expect, it } from "vitest";
import { MAX_JSON_BYTES, readJsonObject } from "./http";

describe("readJsonObject body budget", () => {
  it.each([null, "", "-1", "1.5", "Infinity", "9007199254740992"])(
    "rejects invalid or absent Content-Length %s before reading",
    async (length) => {
      let read = false;
      const req = {
        headers: new Headers(length === null ? {} : { "content-length": length }),
        json: async () => { read = true; return {}; },
      } as Request;
      const result = await readJsonObject(req);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(411);
      expect(read).toBe(false);
    },
  );

  it("rejects an oversized declared body before reading", async () => {
    const req = new Request("http://localhost", {
      method: "POST", body: "{}",
      headers: { "content-length": String(MAX_JSON_BYTES + 1) },
    });
    const result = await readJsonObject(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
    expect(req.bodyUsed).toBe(false);
  });

  it("accepts a valid bounded object", async () => {
    const req = new Request("http://localhost", {
      method: "POST", body: "{}", headers: { "content-length": "2" },
    });
    expect(await readJsonObject(req)).toEqual({ ok: true, value: {} });
  });
});
