import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

/**
 * Share image: brand text on the dark brand background with the arc motif. Plain text only.
 */
export function renderOg(title: string, subtitle: string): ImageResponse {
  const fontSize = title.length > 40 ? 60 : title.length > 24 ? 68 : 92;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#1b1d1f",
        color: "#f5f3ee",
        padding: "64px 72px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="84" height="60" viewBox="0 0 28 20">
          <path d="M3 16 Q14 -2 25 12" fill="none" stroke="#f07a4a" strokeWidth="2" />
          <circle cx="3" cy="16" r="2.5" fill="#f5f3ee" />
          <circle cx="25" cy="12" r="2.5" fill="#f07a4a" />
        </svg>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
          Gdzie Polecę
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: -2,
            maxWidth: 1040,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 34, color: "#c9c2b2" }}>
          {subtitle}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          height: 8,
          width: 220,
          background: "#f07a4a",
          borderRadius: 4,
        }}
      />
    </div>,
    { ...OG_SIZE },
  );
}
