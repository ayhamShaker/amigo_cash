"use client";

import { useState } from "react";

/** Icon field for a cash-out method: a built-in icon or an uploaded image, with a live preview. */
export function MethodIconPicker({ current, icons }: { current: string; icons: readonly string[] }) {
  const [preview, setPreview] = useState(current);
  const [icon, setIcon] = useState("");
  return (
    <div className="row wr" style={{ gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- local icon or inline upload preview */}
      <img className="mlogo" src={preview} alt="" width={48} height={48} style={{ width: 48, height: 48 }} />
      <label className="field" style={{ minWidth: 150 }}>
        <span className="flabel">أيقونة جاهزة</span>
        <select
          className="input"
          name="icon"
          value={icon}
          onChange={(e) => {
            setIcon(e.target.value);
            if (e.target.value) setPreview(`/methods/${e.target.value}.svg`);
          }}
        >
          <option value="">بدون تغيير</option>
          {icons.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      <label className="field" style={{ minWidth: 180 }}>
        <span className="flabel">أو ارفع صورة (حتى 100KB)</span>
        <input
          className="input"
          type="file"
          name="imageFile"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPreview(URL.createObjectURL(f));
          }}
        />
      </label>
    </div>
  );
}
