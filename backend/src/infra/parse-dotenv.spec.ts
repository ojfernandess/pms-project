import { parseDotenvBlock, upsertDotenvVar } from "./parse-dotenv";

describe("parse-dotenv", () => {
  it("upserts without dropping other keys", () => {
    const base = "FOO=1\nBOOKING_ENGINE_TRAEFIK_RULE=Host(`old`)";
    const next = upsertDotenvVar(base, "BOOKING_ENGINE_TRAEFIK_RULE", "Host(`new`)");
    const map = parseDotenvBlock(next);
    expect(map.get("FOO")).toBe("1");
    expect(map.get("BOOKING_ENGINE_TRAEFIK_RULE")).toBe("Host(`new`)");
  });
});