"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface TocItem {
  id: string;
  label: string;
}

export function AboutToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  return (
    <aside
      aria-label="On this page"
      className="sticky top-12 hidden w-48 shrink-0 self-start border border-[var(--dc-line)] bg-[var(--dc-panel)] p-4 lg:block"
    >
      <p className="dc-mono mb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--dc-dim)]">
        On this page
      </p>
      <ul className="space-y-0.5 border-l border-[var(--dc-line)]">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={cn(
                  "-ml-px block border-l py-1.5 pl-3 dc-mono text-[11px] uppercase tracking-[0.1em] transition-colors",
                  isActive
                    ? "border-[var(--dc-signal)] text-[var(--dc-signal)]"
                    : "border-transparent text-[var(--dc-dim)] hover:text-[var(--dc-mute)]",
                )}
                aria-current={isActive ? "true" : undefined}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
