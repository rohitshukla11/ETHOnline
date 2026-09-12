import Link from "next/link";

const steps = [
  {
    n: "01",
    title: "Prove you're a real farmer",
    body: "World ID Selfie Check - a liveness-verified person, not just a wallet. The nullifier is written onchain against your address, so one identity gets one claim and a second address presenting the same nullifier is refused.",
    href: "/verify",
    sponsor: "World",
  },
  {
    n: "02",
    title: "Tokenize your warehouse receipt",
    body: "Crop, grade, quantity, storage location and expiry are issued as an Asset Tokenization Studio security token on Hedera, whitelisted to your verified address only.",
    href: "/tokenize",
    sponsor: "Hedera",
  },
  {
    n: "03",
    title: "Get underwritten privately",
    body: "Land records, yield history and repayment history go into a Chainlink CRE Confidential Workflow. Scoring happens inside a TEE. Only the approved amount and terms reach the chain.",
    href: "/loan",
    sponsor: "Chainlink",
  },
  {
    n: "04",
    title: "Borrow above collateral value",
    body: "Because the enclave sees what the chain can't, Godaam can lend up to 220% of the receipt's appraised value. Repay in installments, or the collateral is force-transferred on default.",
    href: "/loan",
    sponsor: "Godaam",
  },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Your harvest is already collateral.
          <br />
          <span className="text-grain">Your track record should count too.</span>
        </h1>
        <p className="max-w-2xl text-stone-400">
          Godaam turns a certified warehouse receipt into onchain collateral, then uses
          confidential compute to underwrite the farmer behind it - lending more than the
          grain alone would justify, without ever publishing private risk data.
        </p>
        <div className="flex gap-3">
          <Link href="/verify" className="btn">
            Start
          </Link>
          <Link href="/loan" className="btn-ghost">
            My loans
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {steps.map((s) => (
          <Link key={s.n} href={s.href} className="card transition hover:border-grain/50">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs text-grain">{s.n}</span>
              <span className="rounded-full border border-stone-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-stone-400">
                {s.sponsor}
              </span>
            </div>
            <h2 className="mb-1 font-semibold">{s.title}</h2>
            <p className="text-sm leading-relaxed text-stone-400">{s.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
