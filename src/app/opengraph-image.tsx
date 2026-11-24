import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Amigo Cash — Play games. Try apps. Get paid.";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #08111A 0%, #0369A1 55%, #0EA5E9 100%)",
          color: "#FFFFFF",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#F5B82E",
              color: "#1A1203",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 900,
            }}
          >
            A
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em" }}>Amigo Cash</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 70, fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.03em" }}>
            Play games. Try apps. Get paid.
          </div>
          <div style={{ fontSize: 30, color: "#E0F2FE" }}>
            Complete tasks, surveys &amp; games — cash out in gift cards or crypto.
          </div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ padding: "12px 24px", borderRadius: 999, background: "rgba(255,255,255,0.18)", fontSize: 22, fontWeight: 700 }}>
            1,000 coins = $1.00
          </div>
          <div style={{ padding: "12px 24px", borderRadius: 999, background: "#F5B82E", color: "#1A1203", fontSize: 22, fontWeight: 800 }}>
            Fast Cashouts
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
