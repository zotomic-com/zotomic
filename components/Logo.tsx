import { cn } from "@/lib/cn";

/** Zotomic wordmark + mark. Uses currentColor-independent brand colors. */
export function Logo({
  className,
  showText = true,
  size = 28,
}: {
  className?: string;
  showText?: boolean;
  size?: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="8" fill="#15803D" />
        <path
          d="M10 10h12l-8.5 9.5H22V22H10l8.5-9.5H10V10Z"
          fill="#fff"
        />
      </svg>
      {showText && (
        <span className="text-lg font-extrabold tracking-tight text-navy">ZOTOMIC</span>
      )}
    </span>
  );
}
