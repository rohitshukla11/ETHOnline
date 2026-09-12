import Link from "next/link";

const stats = [
  { value: "220%", label: "Loan to value, certified in a TEE" },
  { value: "42,000", label: "kg of wheat under custody" },
  // The privacy claim as a single number. This is the one stat that states what the
  // system does not do, which is the part that is hard to fake.
  { value: "0", label: "Private inputs written onchain" },
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
      <section className="flex flex-col items-center text-center">
        <span className="pill">Live on Hedera</span>

        <h1 className="mt-5 text-[34px] leading-[38px] tracking-[-0.025em] sm:text-hero">
          Your harvest is already collateral
        </h1>

        <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-muted">
          Farmers tokenize a certified warehouse receipt, get scored privately inside a
          secure enclave, and borrow above what the grain alone would allow.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/verify" className="btn">
            Launch app
          </Link>
          <Link href="#how-it-works" className="btn-ghost">
            How it works
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className="metric">{s.value}</p>
            <p className="mt-1.5 text-label text-muted">{s.label}</p>
          </div>
        ))}
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
