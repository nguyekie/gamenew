# Tiến độ các phase

## Phase 0 - Khởi tạo và chuẩn hóa dự án

**Trạng thái:** hoàn thành.

- Monorepo gồm web client, API server, game server và gói kiểu dùng chung.
- TypeScript strict, ESLint, Prettier, CI và Docker Compose.
- Health check cho hai máy chủ.

## Phase 1 - Bản đồ và điều khiển tướng

**Trạng thái:** hoàn thành.

- Bản đồ Phaser 2400x1600, vật cản, camera bám/thu phóng/kéo.
- Di chuyển WASD, ngắm chuột, lướt có hồi chiêu và animation nguyên mẫu.

## Phase 2 - Server thời gian thực

**Trạng thái:** hoàn thành.

- Room hai người, WebSocket 20 Hz, mô phỏng authoritative và cửa sổ kết nối lại.
- Client prediction/reconciliation và nội suy tướng từ xa.

## Phase 3 - Điều khiển quân

**Trạng thái:** hoàn thành.

- Chọn đơn/khung/Shift, nhóm điều khiển và bốn đội hình.
- A* phía client/server, kiểm tra quyền sở hữu lệnh.

## Phase 4 - Chiến đấu

**Trạng thái:** hoàn thành.

- Máu, giáp, sát thương, hồi chiêu, projectile và line-of-sight do server quyết định.
- Đánh thường, xung lực Aether, phát bắn xuyên phá và log chiến đấu.

## Phase 5 - Địa hình và fog of war

**Trạng thái:** hoàn thành.

- Ô chưa thấy/đã khám phá/đang thấy, rừng che giấu, đồi tăng tầm nhìn và pháo sáng.
- Snapshot không gửi tọa độ kẻ địch bị che; minimap chỉ dùng dữ liệu đã lọc.

## Phase 6 - Kinh tế và xây dựng

**Trạng thái:** hoàn thành.

- Vàng, gỗ, lương thực và tám mỏ hữu hạn.
- Năm công trình, xác thực vị trí, phạm vi tiếp tế, hàng chờ huấn luyện và điểm tập kết.

## Phase 7 - Đội hình, sĩ khí và khắc chế

**Trạng thái:** hoàn thành.

- Sáu loại quân, bảng khắc chế, đánh sườn/sau lưng và sĩ khí.
- Kỵ binh xung kích, lính giáo chống giáo và lợi thế địa hình cao.

## Phase 8 - Trận PvP hoàn chỉnh

**Trạng thái:** hoàn thành.

- Hai căn cứ, cầu trung tâm, đếm ngược, tạm dừng khi mất kết nối.
- Thắng bằng phá nhà chính, đầu hàng, hết hạn kết nối hoặc điểm khi hết giờ.
- Thống kê và lưu PostgreSQL, có JSONL dự phòng.

## Phase 9 - Hướng dẫn và Chương 1

**Trạng thái:** hoàn thành MVP.

- Engine nhiệm vụ có hội thoại, mục tiêu, trigger zone và spawn wave.
- Năm nhiệm vụ: Thức tỉnh, Tập hợp, Nền móng, Ngã rẽ và Giữ cầu.
- Lựa chọn ở Rừng Sương được lưu và thay đổi hội thoại nhiệm vụ cuối.
- Tiến trình lưu localStorage; nhiệm vụ có thể khởi động lại với runtime sạch.
- Overlay nêu rõ mục tiêu và gợi ý theo ngữ cảnh.

## Phase 10 - Matchmaking, xếp hạng và vận hành

**Trạng thái:** hoàn thành MVP Closed Alpha.

- Đăng ký/đăng nhập bằng mật khẩu băm scrypt, token phiên và hồ sơ MMR.
- Hàng chờ 1v1 lọc vùng, độ trễ và khoảng MMR mở rộng theo thời gian.
- Kết quả có `resultId` idempotent; công thức Elo cập nhật thắng/thua.
- Rate limit cửa sổ trượt, metrics lỗi/latency/hàng chờ, danh sách trận quản trị.
- Docker staging qua Nginx HTTPS và bài tải nhiều room WebSocket.

## Phase 11 - Hoàn thiện và Closed Alpha

**Trạng thái:** hoàn thành MVP.

- UI được Việt hóa, responsive, có trạng thái kết nối và phản hồi rõ ràng.
- Thiết lập hiệu ứng, âm thanh, giảm chuyển động, tương phản cao và cỡ UI.
- Endpoint cấu hình cân bằng dữ liệu, telemetry và timeline replay sự kiện.
- Bot luyện tập chạy trên game server, tự tìm mục tiêu và tiến công authoritative.
- Kết quả trận đã có thống kê tài nguyên, sản xuất, tổn thất, công trình và sát thương.

## Giới hạn còn lại

- Auth/MMR/hàng chờ cần chuyển từ bộ nhớ sang PostgreSQL/Redis trước production.
- Cần asset âm thanh, VFX và animation cuối; hiện vẫn là phong cách nguyên mẫu.
- Cần playtest người thật để xác nhận thời lượng 15-30 phút và cân bằng win rate.
- Cần E2E trình duyệt tự động, crash reporting bên thứ ba và tải mục tiêu production.
- Replay mới là timeline sự kiện, chưa tái mô phỏng toàn bộ trạng thái.
