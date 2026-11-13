import { Job } from "bullmq";
import { SystemProcessor } from "./system.processor";

describe("SystemProcessor", () => {
  const processor = new SystemProcessor();

  it("acknowledges ping jobs", async () => {
    const job = { id: "1", name: "ping", data: { requestedAt: "2026-11-06T00:00:00.000Z" } } as Job;
    await expect(processor.process(job)).resolves.toEqual({
      ok: true,
      requestedAt: "2026-11-06T00:00:00.000Z",
    });
  });

  it("rejects unknown jobs so BullMQ can retry or fail them", async () => {
    const job = { id: "2", name: "other", data: { requestedAt: "" } } as Job;
    await expect(processor.process(job)).rejects.toThrow("Unsupported system job: other");
  });
});
