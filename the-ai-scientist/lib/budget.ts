import { Budget, Equipment, Material } from "./schemas";

export function recomputeBudget(args: {
  materials: Material[];
  equipment: Equipment[];
  laborOrService?: number | null;
  contingencyPercent?: number;
  currency?: string;
  notesPrefix?: string;
}): Budget {
  const currency = args.currency || "USD";
  const contingencyPercent = args.contingencyPercent ?? 15;
  const knownMaterialCosts: number[] = [];
  const lowConfidenceItems: string[] = [];

  for (const m of args.materials) {
    if (m.estimated_cost !== null && m.estimated_cost !== undefined && Number.isFinite(m.estimated_cost)) {
      knownMaterialCosts.push(m.estimated_cost);
    }
    if (m.confidence === "low" || m.unit_cost === null || m.estimated_cost === null) {
      lowConfidenceItems.push(`${m.name} (${m.supplier || "supplier unknown"})`);
    }
  }

  const materialSubtotal = knownMaterialCosts.reduce((a, b) => a + b, 0);

  const equipmentNeededCosts: number[] = [];
  for (const e of args.equipment) {
    if (e.estimated_cost_if_not_available !== null && e.estimated_cost_if_not_available !== undefined) {
      const assumeAvailable = /already|present|in[- ]?house|on hand|available/i.test(
        e.availability_assumption || ""
      );
      if (!assumeAvailable) {
        equipmentNeededCosts.push(e.estimated_cost_if_not_available);
      }
    }
  }
  const equipmentSubtotal = equipmentNeededCosts.reduce((a, b) => a + b, 0);

  const labor = typeof args.laborOrService === "number" && Number.isFinite(args.laborOrService)
    ? args.laborOrService
    : null;

  const baseSum = materialSubtotal + equipmentSubtotal + (labor ?? 0);
  const contingencyAmount = round2(baseSum * (contingencyPercent / 100));
  const estimatedTotal = round2(baseSum + contingencyAmount);

  const totalMaterials = args.materials.length;
  const knownCount = knownMaterialCosts.length;

  const notes: string[] = [];
  if (args.notesPrefix) notes.push(args.notesPrefix);
  notes.push(
    `${knownCount}/${totalMaterials} material costs known. Subtotal sums known costs only.`
  );
  if (knownCount === 0 && totalMaterials > 0) {
    notes.push("No supplier prices were available; budget is a placeholder. Mark as low confidence.");
  } else if (knownCount < totalMaterials) {
    notes.push("Some materials lack supplier price data; estimated total is a lower bound.");
  }
  if (equipmentNeededCosts.length > 0) {
    notes.push(`${equipmentNeededCosts.length} equipment item(s) assumed not available; cost added to budget.`);
  }
  notes.push(`Contingency: ${contingencyPercent}%.`);

  return {
    currency,
    material_line_items_total: round2(materialSubtotal),
    equipment_line_items_total_if_needed: round2(equipmentSubtotal),
    labor_or_service_estimate: labor,
    contingency_percent: contingencyPercent,
    contingency_amount: contingencyAmount,
    estimated_total: estimatedTotal,
    calculation_notes: notes.join(" "),
    low_confidence_items: lowConfidenceItems,
    editable: true
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
