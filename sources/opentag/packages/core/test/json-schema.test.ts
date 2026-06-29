import { describe, expect, it } from "vitest";
import { OpenTagJsonSchemas } from "../src/json-schema.js";

describe("OpenTagJsonSchemas", () => {
  it("exports public JSON Schemas for protocol objects", () => {
    expect(OpenTagJsonSchemas.OpenTagEvent).toMatchObject({
      $ref: "#/definitions/OpenTagEvent",
      definitions: {
        OpenTagEvent: {
          type: "object"
        }
      }
    });
    expect(OpenTagJsonSchemas.OpenTagRun).toHaveProperty("definitions.OpenTagRun");
    expect(OpenTagJsonSchemas.OpenTagRunResult).toHaveProperty("definitions.OpenTagRunResult");
    expect(OpenTagJsonSchemas.WorkThread).toHaveProperty("definitions.WorkThread");
    expect(OpenTagJsonSchemas.ContextPacket).toHaveProperty("definitions.ContextPacket");
    expect(OpenTagJsonSchemas.RunAdmissionDecision).toHaveProperty("definitions.RunAdmissionDecision");
    expect(OpenTagJsonSchemas.RunEvent).toHaveProperty("definitions.RunEvent");
    expect(OpenTagJsonSchemas.AdapterMutationMapping).toHaveProperty("definitions.AdapterMutationMapping");
    expect(OpenTagJsonSchemas.CapabilityContract).toHaveProperty("definitions.CapabilityContract");
    expect(OpenTagJsonSchemas.PolicyResolution).toHaveProperty("definitions.PolicyResolution");
    expect(OpenTagJsonSchemas.ProposalLineage).toHaveProperty("definitions.ProposalLineage");
    expect(OpenTagJsonSchemas.SuccessMetricName).toHaveProperty("definitions.SuccessMetricName");
    expect(OpenTagJsonSchemas.SuggestedChangesSnapshot).toHaveProperty("definitions.SuggestedChangesSnapshot");
    expect(OpenTagJsonSchemas.ApprovalDecision).toHaveProperty("definitions.ApprovalDecision");
    expect(OpenTagJsonSchemas.ApplyPlan).toHaveProperty("definitions.ApplyPlan");
  });
});
