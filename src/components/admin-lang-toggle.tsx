"use client";

import { Icon } from "./icons";

export function AdminLangToggle({ current }: { current: "ar" | "en" }) {
  const next = current === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      className="btn sm topghost"
      onClick={() => {
        document.cookie = `amigo_admin_lang=${next}; path=/; max-age=31536000; samesite=lax`;
        window.location.reload();
      }}
      aria-label={next === "en" ? "Switch admin to English" : "التبديل إلى العربية"}
    >
      <Icon name="globe" size={16} />
      <span>{next === "en" ? "EN" : "عربي"}</span>
    </button>
  );
}
