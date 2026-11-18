import * as fs from "fs";
import * as path from "path";
import {
  collectXmlBlocks,
  readXmlAttr,
  xmlHasSuccess,
} from "./bukly-ota.util";

/** Smoke test do XML de grupo em docs/6AFAF6EE907C9.xml */
describe("Bukly OTA ResRetrieve parse (group sample)", () => {
  it("parses 6AFAF6EE907C9 with 9 room stays", () => {
    const xmlPath = path.join(__dirname, "..", "..", "..", "docs", "6AFAF6EE907C9.xml");
    const xml = fs.readFileSync(xmlPath, "utf8");
    expect(xmlHasSuccess(xml)).toBe(true);
    const hotels = collectXmlBlocks(xml, "HotelReservation");
    expect(hotels.length).toBe(1);
    const block = hotels[0];
    expect(readXmlAttr(block, "ResStatus")).toBe("Book");
    const stays = collectXmlBlocks(block, "RoomStay");
    expect(stays.length).toBe(9);
    const type14 = collectXmlBlocks(block, "UniqueID").find((u) => readXmlAttr(u, "Type") === "14");
    expect(readXmlAttr(type14 || "", "ID")).toBe("6AFAF6EE907C9");
    const total = collectXmlBlocks(collectXmlBlocks(block, "ResGlobalInfo")[0] || "", "Total")[0];
    expect(readXmlAttr(total || "", "AmountAfterTax")).toBe("1924.21");
  });
});