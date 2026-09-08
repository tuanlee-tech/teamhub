import type { ReactNode } from "react";

type PaperPanelProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
};

export function PaperPanel({ children, className = "", as: Tag = "div" }: PaperPanelProps) {
  return <Tag className={`paper-panel ${className}`}>{children}</Tag>;
}
