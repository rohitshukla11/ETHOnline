import { Fragment } from "react";

/** Shared primitives for the v2 interface. Presentation only. */

/**
 * Segmented progress. One segment per installment, filled segments in wheat.
 * Both counts come straight off the loan struct, so nothing here is inferred.
 */
export function Segments({
  total,
  filled,
  label,
  markAt,
}: {
  total: number;
  filled: number;
  label?: string;
  /** Draw a divider after this many segments, to mark a threshold inside the track
   *  rather than at its end. */
  markAt?: number;
}) {
  if (total <= 0) return null;
  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={label ?? `${filled} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <Fragment key={i}>
          <span
            className={`h-[5px] flex-1 rounded-pill ${i < filled ? "bg-wheat" : "bg-border"}`}
          />
          {markAt === i + 1 && i + 1 < total && (
            <span className="h-[11px] w-[2px] shrink-0 rounded-pill bg-wheat-edge" />
          )}
        </Fragment>
      ))}
    </div>
  );
}

export function Metric({
  label,
  value,
  tint = false,
}: {
  label: string;
  value: React.ReactNode;
  tint?: boolean;
}) {
  return (
    <div className={tint ? "card-tint" : "card"}>
      <p className="text-label text-muted">{label}</p>
      <p className={`mt-1.5 text-metric font-medium tabular-nums ${tint ? "text-wheat-text" : "text-text"}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * Where a number came from, stated beside it.
 *
 * `degraded` is the point of the component: a hand-encoded figure and a live TEE output
 * must never look alike. Degraded provenance takes `--bad`; live provenance is muted.
 */
export function Provenance({
  label,
  source,
  degraded,
}: {
  label: string;
  source: string;
  degraded: boolean;
}) {
  return (
    <p className={`text-label ${degraded ? "text-bad" : "text-muted"}`}>
      {label} {source}
    </p>
  );
}
