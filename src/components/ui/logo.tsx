import type { SVGProps } from "react";

type LogoProps = SVGProps<SVGSVGElement>;

export function Logo(props: LogoProps) {
  return (
    <svg viewBox="-10 0 530 135" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <style>
          {`.logo-team{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-weight:bold;font-size:110px;fill:var(--ink)}
.hub-bg{fill:var(--signal)}
.logo-hub{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-weight:bold;font-size:110px;fill:var(--white)}`}
        </style>
      </defs>
      <text x="0" y="98" className="logo-team">Team</text>
      <rect x="280" y="2" width="230" height="130" className="hub-bg" rx="16" ry="16" />
      <text x="293" y="98" className="logo-hub">hub</text>
    </svg>
  );
}
