"use client";

export function QuickReplies({ target, replies }: { target: string; replies: string[] }) {
  return (
    <div className="row wr" style={{ gap: 6 }}>
      {replies.map((r) => (
        <button
          key={r}
          type="button"
          className="tab"
          dir="auto"
          onClick={() => {
            const el = document.getElementById(target) as HTMLTextAreaElement | null;
            if (el) {
              el.value = r;
              el.focus();
            }
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
