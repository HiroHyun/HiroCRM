import { describe, expect, it } from "vitest";
import { contentTypeForStoredName, isStoredUploadName } from "./uploads";

describe("isStoredUploadName", () => {
  it("accepts the shapes the app generates and seeds", () => {
    expect(isStoredUploadName("0f8fad5b-d9cb-469f-a165-70867728950e.png")).toBe(true);
    expect(isStoredUploadName("seed-warehouse_01.jpeg")).toBe(true);
    expect(isStoredUploadName("shot.WEBP")).toBe(true);
    expect(isStoredUploadName("a.gif")).toBe(true);
  });

  it("rejects traversal, separators, and unlisted extensions", () => {
    expect(isStoredUploadName("../dev.db")).toBe(false);
    expect(isStoredUploadName("..%2Fdev.db")).toBe(false);
    expect(isStoredUploadName("a/b.png")).toBe(false);
    expect(isStoredUploadName("a\\b.png")).toBe(false);
    expect(isStoredUploadName("evil.svg")).toBe(false);
    expect(isStoredUploadName("no-extension")).toBe(false);
    expect(isStoredUploadName("")).toBe(false);
  });

  it("rejects Windows reserved device stems, case-insensitively", () => {
    expect(isStoredUploadName("CON.png")).toBe(false);
    expect(isStoredUploadName("con.png")).toBe(false);
    expect(isStoredUploadName("PRN.JPG")).toBe(false);
    expect(isStoredUploadName("aux.webp")).toBe(false);
    expect(isStoredUploadName("NUL.gif")).toBe(false);
    expect(isStoredUploadName("COM1.webp")).toBe(false);
    expect(isStoredUploadName("com9.png")).toBe(false);
    expect(isStoredUploadName("LPT9.jpeg")).toBe(false);
    expect(isStoredUploadName("CON.x.png")).toBe(false);
  });

  it("keeps names that merely contain a device word", () => {
    expect(isStoredUploadName("CONTRACT.png")).toBe(true);
    expect(isStoredUploadName("economy.png")).toBe(true);
    expect(isStoredUploadName("COM10.png")).toBe(true);
    expect(isStoredUploadName("aux-panel.jpg")).toBe(true);
  });
});

describe("contentTypeForStoredName", () => {
  it("maps jpg and jpeg onto image/jpeg, others onto their extension", () => {
    expect(contentTypeForStoredName("a.jpg")).toBe("image/jpeg");
    expect(contentTypeForStoredName("a.jpeg")).toBe("image/jpeg");
    expect(contentTypeForStoredName("a.png")).toBe("image/png");
    expect(contentTypeForStoredName("a.webp")).toBe("image/webp");
    expect(contentTypeForStoredName("a.gif")).toBe("image/gif");
  });
});
