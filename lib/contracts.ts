import { parseAbi, type Address } from "viem";

const addr = (v: string | undefined): Address =>
  (v ?? "0x0000000000000000000000000000000000000000") as Address;

export const addresses = {
  worldIdRegistry: addr(process.env.NEXT_PUBLIC_WORLD_ID_REGISTRY),
  warehouseReceipt: addr(process.env.NEXT_PUBLIC_WAREHOUSE_RECEIPT),
  mockUsdc: addr(process.env.NEXT_PUBLIC_MOCK_USDC),
  godaamVault: addr(process.env.NEXT_PUBLIC_GODAAM_VAULT),
};

export const worldIdRegistryAbi = parseAbi([
  "function isVerified(address account) view returns (bool)",
  "function attestVerification(address account, uint256 nullifierHash)",
  "function nullifierOwner(uint256 nullifierHash) view returns (address)",
  "event FarmerVerified(address indexed account, uint256 indexed nullifierHash, uint64 verifiedAt)",
]);

export const warehouseReceiptAbi = parseAbi([
  "struct ReceiptData { string cropType; string grade; uint256 quantityKg; string storageLocation; uint64 expiry; uint256 appraisedValue; address atsTokenAddress; string atsTokenId; }",
  "function issue(address to, ReceiptData data) returns (uint256)",
  "function grantKyc(address account)",
  "function kycGranted(address account) view returns (bool)",
  "function tokenFrozen(uint256 tokenId) view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function receiptOf(uint256 tokenId) view returns (ReceiptData)",
  "function appraisedValueOf(uint256 tokenId) view returns (uint256)",
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "event ReceiptIssued(uint256 indexed tokenId, address indexed to, string atsTokenId, uint256 appraisedValue)",
]);

export const godaamVaultAbi = parseAbi([
  "struct Loan { address borrower; uint256 receiptId; uint256 collateralValue; uint256 principal; uint256 totalOwed; uint256 repaid; uint256 installmentAmount; uint64 startedAt; uint64 installmentPeriod; uint16 aprBps; uint16 ltvBps; uint16 riskScore; uint8 installmentCount; uint8 installmentsPaid; bytes32 privateInputCommitment; uint8 status; }",
  "function requestLoan(uint256 receiptId) returns (uint256)",
  "function repayInstallment(uint256 loanId)",
  "function repayFull(uint256 loanId)",
  "function liquidate(uint256 loanId)",
  "function isLiquidatable(uint256 loanId) view returns (bool)",
  "function amountDue(uint256 loanId) view returns (uint256)",
  "function nextDueDate(uint256 loanId) view returns (uint64)",
  "function getLoan(uint256 loanId) view returns (Loan)",
  "function nextLoanId() view returns (uint256)",
  "function activeLoanOfReceipt(uint256 receiptId) view returns (uint256)",
  "event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 indexed receiptId, uint256 collateralValue)",
  "event LoanApproved(uint256 indexed loanId, uint256 principal, uint16 aprBps, uint16 ltvBps, uint16 riskScore, uint256 totalOwed)",
  "event LoanRejected(uint256 indexed loanId, uint16 riskScore)",
  "event LoanLiquidated(uint256 indexed loanId, uint256 indexed receiptId, address liquidator, uint256 shortfall)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function faucet()",
]);

export const LOAN_STATUS = [
  "None",
  "Requested",
  "Active",
  "Repaid",
  "Liquidated",
  "Rejected",
] as const;

export const formatUsdc = (v: bigint | undefined) =>
  v === undefined ? "-" : `${(Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} gUSDC`;
