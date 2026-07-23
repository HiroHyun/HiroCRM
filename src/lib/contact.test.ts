// Contact-handling rules (dedup normalization, live country detection, and
// render-only formatting), per the 2026-07-11 owner clarifications, encoded
// as assertions. Detection fixtures were pre-verified against the installed
// libphonenumber-js@1.13.8 — the cardinal rule is "never name a wrong
// country", so the matrix leans adversarial.
import { describe, expect, it } from "vitest";
import {
  detectCountry,
  formatContactDisplay,
  normalizeContactKey,
} from "./contact";

describe("detectCountry — explicit + input (live, AsYouType)", () => {
  it("resolves full international numbers", () => {
    expect(detectCountry("+996700123456")).toBe("Kyrgyzstan");
    expect(detectCountry("+996 700 123 456")).toBe("Kyrgyzstan");
    expect(detectCountry("+8613912345678")).toBe("China");
  });

  it("resolves partials live once the prefix is unambiguous (no full validation)", () => {
    expect(detectCountry("+9967")).toBe("Kyrgyzstan");
  });

  it("a + anywhere starts the number", () => {
    expect(detectCountry("whatsapp +996 700 123 456")).toBe("Kyrgyzstan");
    expect(detectCountry("tel:+996700123456")).toBe("Kyrgyzstan");
    expect(detectCountry("00+996700123456")).toBe("Kyrgyzstan");
  });

  it("labels the NANP as United States/Canada, resolving before region certainty (D2)", () => {
    expect(detectCountry("+14155552671")).toBe("United States/Canada");
    expect(detectCountry("+1")).toBe("United States/Canada");
    expect(detectCountry("+1999555")).toBe("United States/Canada");
  });

  it("still names non-US/CA NANP countries once resolved", () => {
    expect(detectCountry("+18765550123")).toBe("Jamaica");
  });

  it("holds shared prefixes until enough digits exist (+7 KZ/RU)", () => {
    expect(detectCountry("+7")).toBe(null);
    expect(detectCountry("+7 701 755 1234")).toBe("Kazakhstan");
    expect(detectCountry("+7 495 123 45 67")).toBe("Russia");
  });

  it("returns null for non-geographic calling codes", () => {
    expect(detectCountry("+80012345678")).toBe(null);
  });
});

describe("detectCountry — leading 00 ≡ +", () => {
  it("treats 00-prefixed input as international", () => {
    expect(detectCountry("008613912345678")).toBe("China");
    expect(detectCountry("  0086 138 1234 5678")).toBe("China"); // strip-first
    expect(detectCountry("0014155552671")).toBe("United States/Canada");
  });

  it("00 alone resolves nothing", () => {
    expect(detectCountry("00")).toBe(null);
  });
});

describe("detectCountry — digits without +/00 never detect", () => {
  it("never names a country for bare digits, even internationally valid shapes", () => {
    // These would validate as KG/CN if tried with a "+" — but bare input is
    // ambiguous by construction, so detection refuses rather than guesses.
    expect(detectCountry("996700123456")).toBe(null);
    expect(detectCountry("996 700 123 456")).toBe(null);
    expect(detectCountry("8613912345678")).toBe(null);
  });

  it("never mislabels fully-typed domestic formats (the verified collisions)", () => {
    expect(detectCountry("2015550123")).toBe(null); // US local ≡ valid Egyptian
    expect(detectCountry("3271234567")).toBe(null); // Italian mobile ≡ valid Belgian
    expect(detectCountry("5321234567")).toBe(null); // Turkish mobile ≡ valid Cuban
    expect(detectCountry("81234567890")).toBe(null); // Indonesian mobile ≡ valid Japanese
  });

  it("rejects half-typed and invalid digit strings alike", () => {
    expect(detectCountry("0555123")).toBe(null);
    expect(detectCountry("70012345")).toBe(null);
    expect(detectCountry("0700123456")).toBe(null);
    expect(detectCountry("123456")).toBe(null);
    expect(detectCountry("9967001234567890")).toBe(null);
  });
});

describe("detectCountry — emails, usernames, degenerate input", () => {
  it("an @ before | marks an email: the +/bare-digit rules never apply", () => {
    expect(detectCountry("x@y.com")).toBe(null);
    expect(detectCountry("x+tag@y.com")).toBe(null);
    expect(detectCountry("user+2023@gmail.com")).toBe(null);
    expect(detectCountry("x+15551234567@y.com")).toBe(null);
  });

  it("usernames never detect, even with embedded digit runs", () => {
    expect(detectCountry("user12345678")).toBe(null);
  });

  it("degenerate inputs return null", () => {
    expect(detectCountry("")).toBe(null);
    expect(detectCountry("   ")).toBe(null);
    expect(detectCountry("|")).toBe(null);
    expect(detectCountry("| +996700123456")).toBe(null);
    expect(detectCountry("+")).toBe(null);
  });
});

describe("detectCountry — only the part before | counts", () => {
  it("detects from the head and ignores the note suffix", () => {
    expect(detectCountry("+996700123456 | met at expo")).toBe("Kyrgyzstan");
  });

  it("never detects from the suffix", () => {
    expect(detectCountry("note | +996700123456")).toBe(null);
  });
});

describe("normalizeContactKey (canonical identity)", () => {
  it("collides suffix-only variants to the identical key — the | note never affects identity", () => {
    expect(normalizeContactKey("+8613800138000 | wa")).toBe("+8613800138000");
    expect(normalizeContactKey("+8613800138000|different")).toBe(
      "+8613800138000",
    );
    expect(normalizeContactKey("+8613800138000")).toBe("+8613800138000");
  });

  it("collides separator-form variants of the same number via E.164", () => {
    expect(normalizeContactKey("008613800138000")).toBe("+8613800138000");
    expect(normalizeContactKey("+86 138-0013(8000)")).toBe("+8613800138000");
    expect(normalizeContactKey("+86.138.0013.8000")).toBe("+8613800138000");
    expect(normalizeContactKey("+86–138–0013–8000")).toBe("+8613800138000"); // en dash
  });

  it("keeps email punctuation significant but folds case", () => {
    expect(normalizeContactKey("a.b@x.com")).not.toBe(
      normalizeContactKey("ab@x.com"),
    );
    expect(normalizeContactKey("A@B.com")).toBe("a@b.com");
    expect(normalizeContactKey("a@b.com")).toBe("a@b.com");
    expect(normalizeContactKey("x+tag@y.com")).toBe("x+tag@y.com");
  });

  it("returns null for an empty pre-| head", () => {
    expect(normalizeContactKey("")).toBe(null);
    expect(normalizeContactKey("   ")).toBe(null);
    expect(normalizeContactKey("| just a note")).toBe(null);
  });

  it("collapses whitespace in the rule-3 fallback", () => {
    expect(normalizeContactKey("WeChat  Hiro88")).toBe("wechat hiro88");
  });

  it("does not force an invalid but phone-shaped number to E.164, and never collides it with a valid number", () => {
    expect(normalizeContactKey("+1 999 555 0100")).toBe("+1 999 555 0100");
    expect(normalizeContactKey("+1 999 555 0100")).not.toBe(
      normalizeContactKey("+19995550100"),
    );
  });

  it("never phone-detects bare digits with no +/00 prefix", () => {
    expect(normalizeContactKey("2015550123")).toBe("2015550123");
    expect(normalizeContactKey("2015550123")).not.toBe(
      normalizeContactKey("+12015550123"),
    );
  });

  it("is idempotent for a representative of each class", () => {
    for (const raw of ["A@B.com", "+996 700-123(456)", "WeChat  Hiro88"]) {
      const once = normalizeContactKey(raw);
      expect(once).not.toBe(null);
      expect(normalizeContactKey(once as string)).toBe(once);
    }
  });
});

describe("formatContactDisplay (render-only)", () => {
  it("formats valid international numbers with real country grouping", () => {
    expect(formatContactDisplay("+996700123456")).toBe("+996 700 123 456");
    expect(formatContactDisplay("+996 (700) 123456")).toBe("+996 700 123 456");
    expect(formatContactDisplay("008613912345678")).toBe("+86 139 1234 5678");
  });

  it("formats the head and re-appends the | suffix verbatim", () => {
    expect(formatContactDisplay("+996700123456 | note")).toBe(
      "+996 700 123 456 | note",
    );
    expect(formatContactDisplay("+996700123456|note")).toBe(
      "+996 700 123 456 | note",
    );
    // Degenerate empty suffix: the dangling pipe carries no information —
    // renders as the formatted head alone.
    expect(formatContactDisplay("+996700123456 |")).toBe("+996 700 123 456");
  });

  it("never extracts a number out of surrounding text", () => {
    expect(formatContactDisplay("+996700123456 call me")).toBe(
      "+996700123456 call me",
    );
  });

  it("passes invalid, partial, and non-phone input through untouched", () => {
    expect(formatContactDisplay("+19995550100")).toBe("+19995550100"); // parseable but invalid
    expect(formatContactDisplay("+9967")).toBe("+9967");
    expect(formatContactDisplay("x@y.com")).toBe("x@y.com");
    expect(formatContactDisplay("wechat_hiro88")).toBe("wechat_hiro88");
    expect(formatContactDisplay("996700123456")).toBe("996700123456"); // bare digits render raw
  });
});
