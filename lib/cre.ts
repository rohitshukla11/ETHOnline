/**
 * Client helper for handing the farmer's private risk inputs to the Chainlink CRE
 * Confidential Workflow.
 *
 * The payload is POSTed to the workflow's confidential HTTP trigger. It is encrypted to
 * the TEE's public key in transit and decrypted only inside the enclave. This app never
 * persists it and the API route never logs it.
 */
export type PrivateRiskInputs = {
  loanId: string;
  borrower: string;
  collateralValue: string;
  landRecordRef: string;
  pastYieldsKgPerHa: number[];
  repaymentHistory: { lender: string; amount: number; daysLate: number }[];
};

export type AssessmentResult = {
  loanId: string;
  approved: boolean;
  riskScore: number;
  ltvBps: number;
  aprBps: number;
  approvedPrincipal: string;
  txHash?: string;
  mode: "cre-live" | "cre-simulation";
};

export async function submitRiskInputs(
  inputs: PrivateRiskInputs
): Promise<AssessmentResult> {
  const res = await fetch("/api/cre/assess", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });
  if (!res.ok) {
    throw new Error((await res.json().catch(() => ({}))).error ?? "Risk assessment failed");
  }
  return res.json();
}
