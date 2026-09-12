import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * CollateralNavOracle.
 *
 * The behaviour worth guarding is that a stale or missing feed NEVER silently becomes a
 * number - it must surface as PriceSource.None. That is the same failure class as the
 * bureau fallback in the CRE workflow and the hand-encoded LTV: a plausible value with
 * the wrong provenance.
 */
const USD6 = (n: number) => BigInt(Math.round(n * 1e6));

// PriceSource
const NONE = 0n, APPRAISAL = 1n, CHAINLINK = 2n;

describe("CollateralNavOracle", () => {
  async function fixture() {
    const [owner, stranger] = await ethers.getSigners();
    const feed = await ethers.deployContract("MockAggregator", [7437857n, 8]);
    const oracle: any = await ethers.deployContract("CollateralNavOracle", [
      owner.address,
      await feed.getAddress(),
    ]);
    return { owner, stranger, feed: feed as any, oracle };
  }

  it("computes NAV from the operator appraisal, 6dp", async () => {
    const { oracle } = await fixture();
    // 42,000 kg = 42 tonnes at $273/tonne = $11,466
    await oracle.setAppraisal(1n, USD6(273), 42_000n);
    const nav = await oracle.navOf(1n);
    expect(nav.navUsd6).to.equal(USD6(11_466));
    expect(nav.quantityKg).to.equal(42_000n);
  });

  it("always reports the crop price as an appraisal, never as an oracle price", async () => {
    // There is no agricultural feed on Hedera. If this ever returns ChainlinkFeed,
    // something has started claiming provenance it does not have.
    const { oracle } = await fixture();
    await oracle.setAppraisal(1n, USD6(273), 42_000n);
    expect((await oracle.navOf(1n)).cropSource).to.equal(APPRAISAL);
  });

  it("reports the reference feed when fresh", async () => {
    const { oracle } = await fixture();
    await oracle.setAppraisal(1n, USD6(273), 42_000n);
    const nav = await oracle.navOf(1n);
    expect(nav.referenceSource).to.equal(CHAINLINK);
    expect(nav.referenceAnswer).to.equal(7437857n);
    expect(nav.referenceDecimals).to.equal(8);
  });

  it("degrades to None when the answer is stale, rather than reporting it", async () => {
    const { oracle, feed } = await fixture();
    await oracle.setAppraisal(1n, USD6(273), 42_000n);
    await feed.setUpdatedAt((await time.latest()) - 4 * 3600); // older than maxAnswerAge
    const nav = await oracle.navOf(1n);
    expect(nav.referenceSource).to.equal(NONE);
    // The NAV itself still resolves - the appraisal is independent of the feed.
    expect(nav.navUsd6).to.equal(USD6(11_466));
  });

  it("degrades to None on a non-positive answer", async () => {
    const { oracle, feed } = await fixture();
    await oracle.setAppraisal(1n, USD6(273), 42_000n);
    await feed.setAnswer(0n);
    expect((await oracle.navOf(1n)).referenceSource).to.equal(NONE);
  });

  it("reverts rather than returning zero for an unappraised receipt", async () => {
    const { oracle } = await fixture();
    await expect(oracle.navOf(99n)).to.be.revertedWithCustomError(oracle, "NoAppraisal");
  });

  it("referencePrice reverts on a stale answer", async () => {
    const { oracle, feed } = await fixture();
    await feed.setUpdatedAt((await time.latest()) - 4 * 3600);
    await expect(oracle.referencePrice()).to.be.revertedWithCustomError(oracle, "StaleAnswer");
  });

  it("only the owner can set an appraisal", async () => {
    const { oracle, stranger } = await fixture();
    await expect(
      oracle.connect(stranger).setAppraisal(1n, USD6(273), 42_000n)
    ).to.be.revertedWithCustomError(oracle, "NotOwner");
  });
});
