"use client";

import { Fragment, useState } from "react";

/**
 * Four inline SVGs. Two strokes each: wheat marks the subject of the step, the darker
 * `--art-ctx` marks the container or context around it. Without that split four
 * all-gold drawings read as decoration rather than as diagrams.
 *
 * Drawn here rather than pulled from an icon set - these are bespoke, and adding a
 * dependency days before filming buys nothing.
 */
const artProps = {
  viewBox: "0 0 112 112",
  className: "h-[124px] w-[124px] shrink-0 sm:h-[152px] sm:w-[152px]",
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const CTX = "rgb(var(--art-ctx))";
const KEY = "rgb(var(--wheat))";

/** Selfie verification: grey phone, wheat face and scan brackets. */
function ArtVerify() {
  return (
    <svg {...artProps}>
      <rect x="34" y="16" width="44" height="80" rx="9" stroke={CTX} />
      <circle cx="56" cy="46" r="13" stroke={KEY} />
      <path d="M40 80a16 16 0 0 1 32 0" stroke={KEY} />
      <path
        d="M14 32V20h12M98 32V20H86M14 80v12h12M98 80v12H86"
        stroke={KEY}
      />
    </svg>
  );
}

/** Receipt issuance: grey document with a folded corner, wheat lines and check stamp. */
function ArtTokenize() {
  return (
    <svg {...artProps}>
      <path
        d="M30 10h38l22 22v58a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z"
        stroke={CTX}
      />
      <path d="M68 10v22h22" stroke={CTX} />
      <path d="M40 48h34M40 60h34M40 72h20" stroke={KEY} />
      <circle cx="82" cy="84" r="17" stroke={KEY} />
      <path d="M73 84.5 79 90.5 90 77" stroke={KEY} />
    </svg>
  );
}

/**
 * Confidential scoring: grey enclave and grey inputs on the left, a wheat padlock and a
 * single wheat output on the right. In and out are different colours because that
 * asymmetry is the point - much goes in, little comes out.
 */
function ArtScore() {
  return (
    <svg {...artProps}>
      <path d="M2 42h24M2 56h24M2 70h24" stroke={CTX} />
      <rect x="30" y="22" width="52" height="68" rx="9" stroke={CTX} />
      <path d="M48 56v-7a8 8 0 0 1 16 0v7" stroke={KEY} />
      <rect x="44" y="56" width="24" height="20" rx="4" stroke={KEY} />
      <path d="M86 56h16M96 50l6 6-6 6" stroke={KEY} />
    </svg>
  );
}

/**
 * Borrowing above value: the 400-to-880 argument as a shape rather than a prop. The bar
 * heights are in that ratio - 36 against 80 - so the drawing states the claim.
 */
function ArtBorrow() {
  return (
    <svg {...artProps}>
      <path d="M14 98h84" stroke={CTX} />
      <rect x="26" y="62" width="28" height="36" rx="3" stroke={CTX} />
      <rect x="64" y="18" width="28" height="80" rx="3" stroke={KEY} />
    </svg>
  );
}

const steps = [
  {
    title: "Prove you're a real farmer",
    tag: "World",
    // Not "Selfie Check": that credential is still pending access, so naming it would
    // claim something the app does not have. This describes the gate that exists.
    body: "World ID verifies a liveness-checked person, not just a wallet. The nullifier is written onchain against your address, so one identity gets one claim and a second address presenting the same nullifier is refused.",
    art: <ArtVerify />,
  },
  {
    title: "Tokenize your warehouse receipt",
    tag: "Hedera",
    body: "Crop, grade, quantity, storage location and expiry are issued as an Asset Tokenization Studio security token on Hedera - a real ERC-1400 instrument with an allowlist and controller powers. The EVM collateral record that the vault lends against is whitelisted to your verified address only.",
    art: <ArtTokenize />,
  },
  {
    title: "Get underwritten privately",
    tag: "Chainlink",
    body: "Land records, yield history and repayment history go into a Chainlink CRE Confidential Workflow. Scoring happens inside a TEE. Only the approved amount and terms reach the chain.",
    art: <ArtScore />,
  },
  {
    title: "Borrow above collateral value",
    tag: "Godaam",
    body: "Because the enclave sees what the chain can't, Godaam can lend up to 220% of the receipt's appraised value. Repay in installments, or the collateral is force-transferred on default.",
    art: <ArtBorrow />,
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const step = steps[active];
  const last = active === steps.length - 1;

  return (
    <section id="how-it-works" className="mx-auto max-w-[960px] scroll-mt-8 pb-14">
      {/* Heading shares the panel's left edge - both sit directly in this container
          with no extra inset. */}
      <h2 className="text-[24px] sm:text-[28px]">How it works</h2>

      <div className="mt-8 flex items-center sm:mt-10">
        {steps.map((s, i) => (
          <Fragment key={s.title}>
            {i > 0 && <span className="h-px flex-1 bg-connector" aria-hidden="true" />}
            <button
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Step ${i + 1}: ${s.title.toLowerCase()}`}
              aria-current={i === active ? "step" : undefined}
              className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center
                rounded-pill text-[15px] tabular-nums transition-colors
                sm:h-[44px] sm:w-[44px] sm:text-[16px] ${
                  i === active
                    ? "bg-wheat font-medium text-wheat-on"
                    : "border border-border-strong text-muted hover:text-text"
                }`}
            >
              {i + 1}
            </button>
          </Fragment>
        ))}
      </div>

      <div
        aria-live="polite"
        className="mt-7 min-h-[200px] rounded-card border border-border bg-surface p-6
          sm:mt-8 sm:min-h-[216px] sm:p-8"
      >
        <div
          key={active}
          className="hiw-panel flex flex-col items-center gap-6 min-[520px]:flex-row
            min-[520px]:items-start sm:gap-9"
        >
          <div className="shrink-0">{step.art}</div>
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 className="text-[19px] sm:text-[22px]">{step.title}</h3>
              <span
                className="rounded-pill border border-wheat-edge bg-wheat-tint px-3
                  py-0.5 text-[12px] text-wheat"
              >
                {step.tag}
              </span>
            </div>
            <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-muted sm:text-[16px]">
              {step.body}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 sm:mt-7">
        <p className="text-[15px] text-muted">
          Step {active + 1} of {steps.length}
        </p>
        <button
          type="button"
          className="btn px-6 py-3 text-[16px]"
          onClick={() => setActive((i) => (i + 1) % steps.length)}
        >
          {last ? "Start over" : "Next step"}
        </button>
      </div>
    </section>
  );
}
