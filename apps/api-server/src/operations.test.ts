import { describe, expect, it } from "vitest";

import { OperationsService, SlidingWindowRateLimiter } from "./operations";

describe("dịch vụ vận hành", () => {
  it("đăng nhập và ghép hai người cùng vùng", () => {
    const service = new OperationsService();
    const first = service.register("Chỉ huy Một", "matkhau1");
    const second = service.register("Chỉ huy Hai", "matkhau2");
    expect(service.login("Chỉ huy Một", "matkhau1").profile.id).toBe(first.profile.id);
    expect(service.joinQueue(first.profile.id, "sea", 50).status).toBe("queued");
    expect(service.joinQueue(second.profile.id, "sea", 70).status).toBe("matched");
    expect(service.queueStatus(first.profile.id).status).toBe("matched");
  });

  it("cập nhật MMR đúng một lần với resultId", () => {
    const service = new OperationsService();
    const first = service.register("Người Thắng", "matkhau1").profile;
    const second = service.register("Người Thua", "matkhau2").profile;
    service.joinQueue(first.id, "sea", 30);
    const paired = service.joinQueue(second.id, "sea", 40);
    if (paired.status !== "matched") throw new Error("Không ghép được trận test");
    expect(service.recordResult(paired.match.id, first.id, "ket-qua-1").updated).toBe(true);
    expect(service.recordResult(paired.match.id, first.id, "ket-qua-1").updated).toBe(false);
    expect(service.profile(first.id).wins).toBe(1);
  });

  it("giới hạn số yêu cầu trong cửa sổ thời gian", () => {
    const limiter = new SlidingWindowRateLimiter(2, 1000);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 1)).toBe(true);
    expect(limiter.allow("ip", 2)).toBe(false);
    expect(limiter.allow("ip", 1001)).toBe(true);
  });
});
