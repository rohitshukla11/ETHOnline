/** Shared primitives for the v2 interface. Presentation only. */

/**
 * Segmented progress. One segment per installment, filled segments in wheat.
 * Both counts come straight off the loan struct, so nothing here is inferred.
 */
export function Segments({ total, filled }: { total: number; filled: number }) {
  if (total <= 0) return null;
  return (
    <div
      className="flex gap-1"
      role="img"
      aria-label={`${filled} of ${total} installments paid`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-[5px] flex-1 rounded-pill ${i < filled ? "bg-wheat" : "bg-border"}`}
        />
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
