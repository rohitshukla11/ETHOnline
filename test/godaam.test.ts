import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const USDC = (n: number) => BigInt(n) * 10n ** 6n;
const MONTH = 30 * 24 * 3600;

const ASSESSMENT_TUPLE =
  "tuple(uint256,bool,uint256,uint16,uint16,uint16,uint8,uint64,bytes32)";

function encodeAssessment(v: {
  loanId: bigint;
  approved: boolean;
  principal: bigint;
  aprBps: number;
  ltvBps: number;
  score: number;
  installments: number;
  period: number;
}) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    [ASSESSMENT_TUPLE],
    [
      [
        v.loanId,
        v.approved,
        v.principal,
        v.aprBps,
        v.ltvBps,
        v.score,
        v.installments,
        v.period,
        ethers.keccak256(ethers.toUtf8Bytes("private-inputs")),
      ],
    ]
  );
}

async function deployAll() {
  const [admin, farmer, outsider, treasury] = await ethers.getSigners();

  const registry = await ethers.deployContract("WorldIdRegistry", [admin.address, admin.address]);
  const usdc = await ethers.deployContract("MockUSDC", [admin.address]);
  const receipts = await ethers.deployContract("WarehouseReceipt", [
    admin.address,
    await registry.getAddress(),
  ]);
  const vault = await ethers.deployContract("GodaamVault", [
    admin.address,
    await usdc.getAddress(),
    await receipts.getAddress(),
    await registry.getAddress(),
    treasury.address,
  ]);
  const forwarder = await ethers.deployContract("MockCreForwarder");

  await receipts.grantRole(await receipts.CONTROLLER_ROLE(), await vault.getAddress());
  await vault.setCreForwarder(await forwarder.getAddress(), ethers.ZeroAddress);
  await usdc.mint(await vault.getAddress(), USDC(1_000_000));

  return { admin, farmer, outsider, treasury, registry, usdc, receipts, vault, forwarder };
}

async function verifiedFarmerWithReceipt(
  ctx: Awaited<ReturnType<typeof deployAll>>,
  who: HardhatEthersSigner,
  appraised = USDC(400)
) {
  const nullifier = BigInt(ethers.keccak256(ethers.toUtf8Bytes(`selfie:${who.address}`)));
  await ctx.registry.attestVerification(who.address, nullifier);
  await ctx.receipts.grantKyc(who.address);
  const tx = await ctx.receipts.issue(who.address, {
    cropType: "Wheat",
    grade: "FAQ-A",
    quantityKg: 42_000,
    storageLocation: "Baramati",
    expiry: (await time.latest()) + 365 * 24 * 3600,
    appraisedValue: appraised,
    atsTokenAddress: ethers.ZeroAddress,
    atsTokenId: "0.0.1234567",
  });
  await tx.wait();
  await ctx.receipts.connect(who).setApprovalForAll(await ctx.vault.getAddress(), true);
  return 1n;
}

async function deliverAssessment(
  ctx: Awaited<ReturnType<typeof deployAll>>,
  payload: Parameters<typeof encodeAssessment>[0]
) {
  const metadata = await ctx.forwarder.buildMetadata(
    ethers.id("godaam-risk-scoring"),
    ethers.hexlify(ethers.toUtf8Bytes("godaam-ris")),
    ethers.ZeroAddress,
    "0x0001"
  );
  return ctx.forwarder.forward(await ctx.vault.getAddress(), metadata, encodeAssessment(payload));
}

describe("Godaam", () => {
  describe("World ID gating", () => {
    it("blocks KYC grant without World ID verification", async () => {
      const ctx = await deployAll();
      await expect(ctx.receipts.grantKyc(ctx.farmer.address)).to.be.revertedWithCustomError(
        ctx.receipts,
        "WorldIdVerificationRequired"
      );
    });

    it("rejects a reused nullifier from a second address", async () => {
      const ctx = await deployAll();
      const n = 12345n;
      await ctx.registry.attestVerification(ctx.farmer.address, n);
      await expect(
        ctx.registry.attestVerification(ctx.outsider.address, n)
      ).to.be.revertedWithCustomError(ctx.registry, "NullifierAlreadyUsed");
    });

    it("blocks loan requests from unverified addresses", async () => {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer);
      await ctx.registry.revokeVerification(ctx.farmer.address);
      await expect(
        ctx.vault.connect(ctx.farmer).requestLoan(1n)
      ).to.be.revertedWithCustomError(ctx.vault, "NotVerified");
    });
  });

  describe("ATS compliance controls", () => {
    it("blocks transfers to non-KYC addresses", async () => {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer);
      await expect(
        ctx.receipts.connect(ctx.farmer).transferFrom(ctx.farmer.address, ctx.outsider.address, 1n)
      ).to.be.revertedWithCustomError(ctx.receipts, "KycRequired");
    });

    it("blocks transfers from frozen accounts", async () => {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer);
      await ctx.registry.attestVerification(ctx.outsider.address, 999n);
      await ctx.receipts.grantKyc(ctx.outsider.address);
      await ctx.receipts.setAccountFrozen(ctx.farmer.address, true);
      await expect(
        ctx.receipts.connect(ctx.farmer).transferFrom(ctx.farmer.address, ctx.outsider.address, 1n)
      ).to.be.revertedWithCustomError(ctx.receipts, "AccountIsFrozen");
    });
  });

  describe("Confidential loan issuance", () => {
    it("only accepts reports from the CRE forwarder", async () => {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer);
      await ctx.vault.connect(ctx.farmer).requestLoan(1n);
      await expect(
        ctx.vault.connect(ctx.outsider).onReport("0x", encodeAssessment({
          loanId: 1n, approved: true, principal: USDC(100),
          aprBps: 1000, ltvBps: 10_000, score: 700, installments: 6, period: MONTH,
        }))
      ).to.be.revertedWithCustomError(ctx.vault, "NotForwarder");
    });

    it("disburses above collateral value when the TEE certifies a high LTV band", async () => {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer, USDC(400));
      await ctx.vault.connect(ctx.farmer).requestLoan(1n);

      const before = await ctx.usdc.balanceOf(ctx.farmer.address);
      await deliverAssessment(ctx, {
        loanId: 1n, approved: true, principal: USDC(520),
        aprBps: 1500, ltvBps: 13_000, score: 612, installments: 6, period: MONTH,
      });
      const after = await ctx.usdc.balanceOf(ctx.farmer.address);

      expect(after - before).to.equal(USDC(520));
      const loan = await ctx.vault.getLoan(1n);
      expect(loan.status).to.equal(2); // Active
      expect(loan.riskScore).to.equal(612);
      expect(loan.totalOwed).to.be.greaterThan(USDC(520));
    });

    it("refuses a principal above the certified LTV band", async () => {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer, USDC(400));
      await ctx.vault.connect(ctx.farmer).requestLoan(1n);
      await expect(
        deliverAssessment(ctx, {
          loanId: 1n, approved: true, principal: USDC(900),
          aprBps: 1500, ltvBps: 13_000, score: 612, installments: 6, period: MONTH,
        })
      ).to.be.revertedWithCustomError(ctx.vault, "ExceedsCollateralCap");
    });

    it("returns collateral when the TEE rejects the applicant", async () => {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer);
      await ctx.vault.connect(ctx.farmer).requestLoan(1n);
      await deliverAssessment(ctx, {
        loanId: 1n, approved: false, principal: 0n,
        aprBps: 0, ltvBps: 0, score: 310, installments: 6, period: MONTH,
      });
      expect(await ctx.receipts.ownerOf(1n)).to.equal(ctx.farmer.address);
      expect((await ctx.vault.getLoan(1n)).status).to.equal(5); // Rejected
    });
  });

  describe("Repayment", () => {
    it("releases collateral after the final installment", async () => {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer);
      await ctx.vault.connect(ctx.farmer).requestLoan(1n);
      await deliverAssessment(ctx, {
        loanId: 1n, approved: true, principal: USDC(520),
        aprBps: 1500, ltvBps: 13_000, score: 612, installments: 6, period: MONTH,
      });

      await ctx.usdc.mint(ctx.farmer.address, USDC(1000));
      await ctx.usdc.connect(ctx.farmer).approve(await ctx.vault.getAddress(), ethers.MaxUint256);

      for (let i = 0; i < 6; i++) {
        await ctx.vault.connect(ctx.farmer).repayInstallment(1n);
        await time.increase(MONTH);
      }

      const loan = await ctx.vault.getLoan(1n);
      expect(loan.status).to.equal(3); // Repaid
      expect(await ctx.receipts.ownerOf(1n)).to.equal(ctx.farmer.address);
      expect(await ctx.receipts.tokenFrozen(1n)).to.equal(false);
    });

    it("settles exactly when totalOwed does not divide evenly by the installment count", async () => {
      // Regression for the truncating division in `installmentAmount`. A principal of 777
      // at 1337bps over 7 x 30d leaves a remainder that `totalOwed / installmentCount`
      // throws away, so N equal payments used to land short of `totalOwed`: the loan stayed
      // Active and the collateral was never released. The final installment must sweep it.
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer);
      await ctx.vault.connect(ctx.farmer).requestLoan(1n);
      await deliverAssessment(ctx, {
        loanId: 1n, approved: true, principal: USDC(777),
        aprBps: 1337, ltvBps: 20_000, score: 741, installments: 7, period: MONTH,
      });

      const loan = await ctx.vault.getLoan(1n);
      // Guard the guard: if this ever divides evenly the test stops proving anything.
      expect(loan.installmentAmount * 7n).to.not.equal(loan.totalOwed);

      await ctx.usdc.mint(ctx.farmer.address, USDC(2000));
      await ctx.usdc.connect(ctx.farmer).approve(await ctx.vault.getAddress(), ethers.MaxUint256);

      const before = await ctx.usdc.balanceOf(ctx.farmer.address);
      for (let i = 0; i < 7; i++) {
        await ctx.vault.connect(ctx.farmer).repayInstallment(1n);
        await time.increase(MONTH);
      }
      const after = await ctx.usdc.balanceOf(ctx.farmer.address);

      const settled = await ctx.vault.getLoan(1n);
      expect(settled.status).to.equal(3); // Repaid, not Active
      expect(settled.repaid).to.equal(settled.totalOwed); // no dust left behind
      expect(settled.installmentsPaid).to.equal(7); // never overruns installmentCount
      expect(before - after).to.equal(settled.totalOwed); // borrower paid exactly what was owed
      expect(await ctx.receipts.ownerOf(1n)).to.equal(ctx.farmer.address);
      expect(await ctx.receipts.tokenFrozen(1n)).to.equal(false);
      await expect(ctx.vault.connect(ctx.farmer).repayInstallment(1n)).to.be.revertedWithCustomError(
        ctx.vault,
        "BadStatus"
      );
    });

    it("supports early full repayment", async () => {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer);
      await ctx.vault.connect(ctx.farmer).requestLoan(1n);
      await deliverAssessment(ctx, {
        loanId: 1n, approved: true, principal: USDC(520),
        aprBps: 1500, ltvBps: 13_000, score: 612, installments: 6, period: MONTH,
      });
      await ctx.usdc.mint(ctx.farmer.address, USDC(1000));
      await ctx.usdc.connect(ctx.farmer).approve(await ctx.vault.getAddress(), ethers.MaxUint256);

      await expect(ctx.vault.connect(ctx.farmer).repayFull(1n)).to.emit(ctx.vault, "LoanRepaid");
      expect(await ctx.receipts.ownerOf(1n)).to.equal(ctx.farmer.address);
    });
  });

  describe("Liquidation", () => {
    async function defaultedLoan() {
      const ctx = await deployAll();
      await verifiedFarmerWithReceipt(ctx, ctx.farmer);
      await ctx.vault.connect(ctx.farmer).requestLoan(1n);
      await deliverAssessment(ctx, {
        loanId: 1n, approved: true, principal: USDC(520),
        aprBps: 1500, ltvBps: 13_000, score: 612, installments: 6, period: MONTH,
      });
      return ctx;
    }

    it("is not liquidatable inside the grace period", async () => {
      const ctx = await defaultedLoan();
      await time.increase(MONTH + 3 * 24 * 3600);
      expect(await ctx.vault.isLiquidatable(1n)).to.equal(false);
      await expect(ctx.vault.liquidate(1n)).to.be.revertedWithCustomError(
        ctx.vault,
        "NotLiquidatable"
      );
    });

    it("lets anyone liquidate after the grace period and force-transfers the receipt", async () => {
      const ctx = await defaultedLoan();
      await time.increase(MONTH + 8 * 24 * 3600);

      expect(await ctx.vault.isLiquidatable(1n)).to.equal(true);
      await expect(ctx.vault.connect(ctx.outsider).liquidate(1n))
        .to.emit(ctx.vault, "LoanLiquidated")
        .and.to.emit(ctx.receipts, "ForcedTransfer");

      expect(await ctx.receipts.ownerOf(1n)).to.equal(ctx.treasury.address);
      expect((await ctx.vault.getLoan(1n)).status).to.equal(4); // Liquidated
      expect(await ctx.receipts.tokenFrozen(1n)).to.equal(false);
    });

    it("liquidation ignores the freeze and the borrower's consent", async () => {
      const ctx = await defaultedLoan();
      await ctx.receipts.setAccountFrozen(await ctx.vault.getAddress(), true);
      await time.increase(MONTH + 8 * 24 * 3600);
      await ctx.vault.liquidate(1n);
      expect(await ctx.receipts.ownerOf(1n)).to.equal(ctx.treasury.address);
    });

    it("can controller-redeem (burn) a seized receipt", async () => {
      const ctx = await defaultedLoan();
      await time.increase(MONTH + 8 * 24 * 3600);
      await ctx.vault.liquidate(1n);
      await expect(ctx.vault.burnSeizedReceipt(1n, "unsellable spoiled stock")).to.emit(
        ctx.receipts,
        "ControllerRedeemed"
      );
      await expect(ctx.receipts.ownerOf(1n)).to.be.reverted;
    });

    it("blocks repayment once liquidated", async () => {
      const ctx = await defaultedLoan();
      await time.increase(MONTH + 8 * 24 * 3600);
      await ctx.vault.liquidate(1n);
      await ctx.usdc.mint(ctx.farmer.address, USDC(1000));
      await ctx.usdc.connect(ctx.farmer).approve(await ctx.vault.getAddress(), ethers.MaxUint256);
      await expect(
        ctx.vault.connect(ctx.farmer).repayInstallment(1n)
      ).to.be.revertedWithCustomError(ctx.vault, "BadStatus");
    });
  });
});
