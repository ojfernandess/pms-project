import {
  buildConvertDealPatch,
  defaultPipelineStageSeeds,
  resolveDealStatusAfterMove,
} from "./crm-deals.logic";

describe("crm-deals.logic", () => {
  it("seeds five default stages", () => {
    const seeds = defaultPipelineStageSeeds();
    expect(seeds).toHaveLength(5);
    expect(seeds.map((s) => s.stage_key)).toEqual([
      "lead",
      "qualified",
      "proposal",
      "won",
      "lost",
    ]);
  });

  it("resolveDealStatusAfterMove marks won/lost/open", () => {
    expect(
      resolveDealStatusAfterMove({
        id: "1",
        stage_key: "won",
        is_won: true,
        is_lost: false,
        position: 3,
      }).status,
    ).toBe("won");
    expect(
      resolveDealStatusAfterMove({
        id: "2",
        stage_key: "lost",
        is_won: false,
        is_lost: true,
        position: 4,
      }).status,
    ).toBe("lost");
    expect(
      resolveDealStatusAfterMove({
        id: "3",
        stage_key: "proposal",
        is_won: false,
        is_lost: false,
        position: 2,
      }).status,
    ).toBe("open");
  });

  it("buildConvertDealPatch only links existing reservation", () => {
    const patch = buildConvertDealPatch("res-1", "stage-won");
    expect(patch.reservation_id).toBe("res-1");
    expect(patch.status).toBe("won");
    expect(patch.stage_id).toBe("stage-won");
    expect(() => buildConvertDealPatch("")).toThrow(/reservationId/);
  });
});
