// The cut-H split-weight wordmark — canonical SVG for the approved E+D
// hybrid design. One deviation, by necessity: the <text>
// font-family becomes var(--font-display), because next/font emits a hashed
// family name that the literal 'Bricolage Grotesque' would never match.

import { strings } from "../lib/strings";

export function Wordmark() {
  return (
    <svg
      className="block text-ink"
      width="84"
      height="20"
      viewBox="0 0 84 20"
      role="img"
      aria-label={strings.app.name}
    >
      <rect x="0" y="2" width="2.6" height="13" fill="currentColor" />
      <rect x="9" y="2" width="2.6" height="13" fill="currentColor" />
      <rect
        x="3.6"
        y="7.2"
        width="4.4"
        height="2.6"
        style={{ fill: "var(--accent)" }}
      />
      <text
        x="14"
        y="15"
        fontFamily="var(--font-display)"
        fontSize="18"
        fontWeight="600"
        fill="currentColor"
      >
        iro
        <tspan fontWeight="400" style={{ fill: "var(--muted)" }}>
          CRM
        </tspan>
      </text>
    </svg>
  );
}
