import { Focusable } from "@decky/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { C } from "./tokens";

/** The summary clamped to `lines`; when it overflows it is focusable and A expands it. */
export function Summary({ text, lines, fontSize, maxWidth }: { text: string; lines: number; fontSize: number; maxWidth: number }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, lines, open]);
  const body = (
    <div
      ref={ref}
      style={{ fontSize, lineHeight: 1.5, color: "rgba(223,227,230,0.9)", whiteSpace: "pre-line", ...(open ? {} : { overflow: "hidden", display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" }) }}
    >
      {text}
    </div>
  );
  if (!overflows && !open) return <div style={{ maxWidth }}>{body}</div>;
  return (
    <Focusable
      onActivate={() => setOpen((o) => !o)}
      onOKActionDescription={open ? "Less" : "More"}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      style={{ maxWidth, borderRadius: 4, padding: "4px 8px", margin: "-4px -8px", background: focused ? "rgba(255,255,255,0.06)" : undefined }}
    >
      {body}
      <div style={{ fontSize: fontSize * 0.8, fontWeight: 600, marginTop: 4, color: focused ? C.title : C.description, letterSpacing: "0.04em" }}>{open ? "LESS" : "MORE"}</div>
    </Focusable>
  );
}

