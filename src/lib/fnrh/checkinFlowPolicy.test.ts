import { describe, it, expect } from "vitest";
import {
  CHECKIN_FLOW_MANUAL_STAFF_DIALOG,
  CHECKIN_FLOW_STAFF_FNRH_EXPLICIT,
  shouldInvokeFnrhSubmitForCheckinFlow,
} from "./checkinFlowPolicy";

describe("checkinFlowPolicy (FNRH)", () => {
  it("não envia FNRH automaticamente no fluxo de check-in manual (staff)", () => {
    expect(
      shouldInvokeFnrhSubmitForCheckinFlow(CHECKIN_FLOW_MANUAL_STAFF_DIALOG),
    ).toBe(false);
  });

  it("permite envio FNRH no fluxo explícito da equipe (botão na reserva)", () => {
    expect(
      shouldInvokeFnrhSubmitForCheckinFlow(CHECKIN_FLOW_STAFF_FNRH_EXPLICIT),
    ).toBe(true);
  });
});
