import Link from "next/link";
import { HowItWorks } from "@/components/HowItWorks";

export default function Home() {
  return (
    <div>
      {/* The hero owns the first screen, so how-it-works starts below the fold.
          115px is the header plus main's top padding; svh rather than vh so
          mobile browser chrome does not push the section taller than the
          visible area. */}
      <section className="flex min-h-[calc(100svh-115px)] flex-col items-center
        justify-center px-2 pb-10 text-center">
        <span className="pill">Live on Hedera testnet</span>

        {/* The break is explicit rather than left to the wrap algorithm, which
            balanced it as "Your harvest is / already collateral". It is suppressed
            below sm so narrow screens wrap naturally instead of stranding a word. */}
        <h1 className="mt-8 max-w-[760px] text-[40px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[54px]">
          Your harvest is already
          <br className="hidden sm:inline" /> collateral
        </h1>

        <p className="mt-6 max-w-[520px] text-[17px] leading-[1.6] text-muted">
          Farmers tokenize a certified warehouse receipt, get scored privately inside a
          secure enclave, and borrow above what the grain alone would allow.
        </p>

        <div className="mt-9 flex flex-wrap justify-center gap-3.5">
          <Link href="/verify" className="btn px-8 py-3 text-[16px] font-bold">
            Launch app
          </Link>
          <Link href="#how-it-works" className="btn-ghost px-8 py-3 text-[16px] font-bold">
            How it works
          </Link>
        </div>

        {/* No wallet needed: the position is read straight off the verified vault. */}
        <p className="mt-5 text-[14px] text-muted">
          Or{" "}
          <Link
            href="/loan/1"
            className="text-text underline underline-offset-4 hover:text-wheat"
          >
            inspect a real loan
          </Link>{" "}
          — 880 gUSDC against 400 of grain, underwritten in a TEE.
        </p>
      </section>

      <HowItWorks />
    </div>
  );
}
