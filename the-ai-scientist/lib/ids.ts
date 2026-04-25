import { randomBytes } from "crypto";

export function newId(prefix?: string): string {
  const id = randomBytes(8).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

export function newPlanId(): string {
  return newId("plan");
}

export function newFeedbackId(): string {
  return newId("fbk");
}

export function newReferenceId(): string {
  return newId("ref");
}

export function newEvidenceId(): string {
  return newId("ev");
}

export function newProtocolStepId(i: number): string {
  return `step_${String(i + 1).padStart(2, "0")}`;
}

export function newMaterialId(i: number): string {
  return `mat_${String(i + 1).padStart(2, "0")}`;
}

export function newEquipmentId(i: number): string {
  return `eq_${String(i + 1).padStart(2, "0")}`;
}

export function newTimelineId(i: number): string {
  return `phase_${String(i + 1).padStart(2, "0")}`;
}

export function newControlId(i: number): string {
  return `ctrl_${String(i + 1).padStart(2, "0")}`;
}

export function newRiskId(i: number): string {
  return `risk_${String(i + 1).padStart(2, "0")}`;
}

export function newAssumptionId(i: number): string {
  return `assume_${String(i + 1).padStart(2, "0")}`;
}
