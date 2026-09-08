import type { ReactNode } from "react";

type DisplayHeadingProps = {
  children: ReactNode;
  level?: 1 | 2 | 3 | 4;
  className?: string;
};

const sizeMap = {
  1: "text-5xl sm:text-7xl",
  2: "text-4xl sm:text-5xl",
  3: "text-3xl",
  4: "text-2xl",
};

export function DisplayHeading({ children, level = 3, className = "" }: DisplayHeadingProps) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
  return <Tag className={`display-type ${sizeMap[level]} ${className}`}>{children}</Tag>;
}
