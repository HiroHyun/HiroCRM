// Detect fixtures are pre-verified against the installed libphonenumber-js
// (see src/lib/contact.test.ts) — this suite only exercises the state
// transitions layered on top of detectCountry.
import { describe, expect, it } from "vitest";
import {
  initialCountryState,
  onContactChange,
  onCountryEdit,
} from "./country-autofill";

describe("initialCountryState", () => {
  it("detects from the initial contact value", () => {
    expect(initialCountryState("+996700123456")).toEqual({
      value: "Kyrgyzstan",
      touched: false,
    });
  });
});

describe("onContactChange (auto-detect while untouched)", () => {
  it("an email never detects", () => {
    expect(
      onContactChange({ value: "", touched: false }, "test@example.com"),
    ).toEqual({ value: "", touched: false });
  });

  it("bare digits never detect", () => {
    expect(
      onContactChange({ value: "", touched: false }, "2015550123"),
    ).toEqual({ value: "", touched: false });
  });

  it("deleting the + prefix clears a previously detected value", () => {
    expect(
      onContactChange({ value: "Kyrgyzstan", touched: false }, "996700123456"),
    ).toEqual({ value: "", touched: false });
  });

  it("a 00 prefix detects like a +", () => {
    expect(
      onContactChange({ value: "", touched: false }, "0086 139 1234 5678"),
    ).toEqual({ value: "China", touched: false });
  });
});

describe("onCountryEdit (manual override freezes, clearing resumes)", () => {
  it("a manual non-empty edit freezes the field against further auto-detect", () => {
    const s = onCountryEdit(
      { value: "Kyrgyzstan", touched: false },
      "Freedonia",
      "+996700123456",
    );
    expect(s).toEqual({ value: "Freedonia", touched: true });

    expect(onContactChange(s, "+8613912345678")).toEqual({
      value: "Freedonia",
      touched: true,
    });
  });

  it("clearing the override resumes live auto-detect", () => {
    const resumed = onCountryEdit(
      { value: "Freedonia", touched: true },
      "",
      "+996700123456",
    );
    expect(resumed).toEqual({ value: "Kyrgyzstan", touched: false });

    expect(onContactChange(resumed, "+8613912345678")).toEqual({
      value: "China",
      touched: false,
    });
  });
});
