"use client";

import { startTransition, useActionState } from "react";
import { FormMessage, Submit, type FormAction } from "./forms";

/** Admin: create a one-time password reset link and show it once to copy. */
export function ResetLinkForm({ action, userId }: { action: FormAction; userId: string }) {
  const [state, formAction] = useActionState(action, null);
  const link = state?.data?.link as string | undefined;
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="card stack"
    >
      <input type="hidden" name="userId" value={userId} />
      <div className="row between wr">
        <span className="small">
          <b>العضو نسي كلمة المرور؟</b> اعمل رابط تغيير كلمة المرور وابعته إله بالشات.
        </span>
        <Submit className="btn ghost">رابط تغيير كلمة المرور</Submit>
      </div>
      {link ? <input className="input num" readOnly dir="ltr" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="الرابط" /> : null}
      <FormMessage state={state} />
    </form>
  );
}
