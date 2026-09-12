import Link from "next/link";

const stats = [
  { value: "220%", lines: ["Loan to value,", "certified in a TEE"] },
  { value: "42,000", lines: ["kg of wheat", "under custody"] },
  // The privacy claim as a single number. This is the one stat that states what the
  // system does not do, which is the part that is hard to fake.
  { value: "0", lines: ["private inputs", "written onchain"] },
];

/**
 * Numbered because the sequence is real and enforced onchain: no verification means no
 * KYC, no KYC means nothing can be minted, and nothing minted means nothing to pledge.
 */
const steps = [
  {
    title: "Prove you're a real farmer",
    body: "World ID Selfie Check - a liveness-verified person, not just a wallet. The nullifier is written onchain against your address, so one identity gets one claim and a second address presenting the same nullifier is refused.",
    sponsor: "World",
  },
  {
    title: "Tokenize your warehouse receipt",
    body: "Crop, grade, quantity, storage location and expiry are issued as an Asset Tokenization Studio security token on Hedera - a real ERC-1400 instrument with an allowlist and controller powers. The EVM collateral record that the vault lends against is whitelisted to your verified address only.",
    sponsor: "Hedera",
  },
  {
    title: "Get underwritten privately",
    body: "Land records, yield history and repayment history go into a Chainlink CRE Confidential Workflow. Scoring happens inside a TEE. Only the approved amount and terms reach the chain.",
    sponsor: "Chainlink",
  },
  {
    title: "Borrow above collateral value",
    body: "Because the enclave sees what the chain can't, Godaam can lend up to 220% of the receipt's appraised value. Repay in installments, or the collateral is force-transferred on default.",
    sponsor: "Godaam",
  },
];

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="flex flex-col items-center pt-6 text-center">
        <span className="pill">Live on Hedera testnet</span>

        {/* The break is explicit rather than left to the wrap algorithm, which
            balanced it as "Your harvest is / already collateral". The <br> is
            suppressed below sm so narrow screens wrap naturally instead of
            stranding a word. */}
        <h1 className="mt-7 text-[38px] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[42px]">
          Your harvest is already
          <br className="hidden sm:inline" /> collateral
        </h1>

        <p className="mt-5 max-w-[460px] text-[16px] leading-[1.6] text-muted">
          Farmers tokenize a certified warehouse receipt, get scored privately inside a
          secure enclave, and borrow above what the grain alone would allow.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3.5">
          <Link href="/verify" className="btn px-8 py-3 text-[16px] font-bold">
            Launch app
          </Link>
          <Link href="#how-it-works" className="btn-ghost px-8 py-3 text-[16px] font-bold">
            How it works
          </Link>
        </div>

        <div className="mt-12 grid w-full gap-3.5 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.value} className="card px-4 py-6 text-center">
              <p className="text-[31px] font-medium leading-none tabular-nums text-wheat">
                {s.value}
              </p>
              <p className="mt-3 text-[14px] leading-[1.35] text-muted">
                {s.lines[0]}
                <br />
                {s.lines[1]}
              </p>
            </div>
          ))}
        </div>

        <Link
          href="#how-it-works"
          aria-label="Skip to how it works"
          className="mt-11 flex h-10 w-10 items-center justify-center rounded-pill
            border border-border-strong text-muted transition-colors
            hover:border-muted hover:text-text"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 3v10M3.5 8.5 8 13l4.5-4.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </section>

      <section id="how-it-works" className="scroll-mt-8">
        <h2 className="text-[19px]">How it works</h2>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="card flex gap-3.5">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center
                  rounded-pill border border-border-strong text-[12px] tabular-nums
                  text-muted"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2.5">
                  <h3 className="text-[15px]">{s.title}</h3>
                  <span className="text-label text-muted">{s.sponsor}</span>
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
