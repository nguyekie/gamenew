# Aetherion Strategy

Aetherion Strategy là game chiến thuật PvP thời gian thực trên web, được triển khai từ tài liệu `Dac_ta_game_chien_thuat_web_PvP_CodeX.docx`. Bản Closed Alpha gồm trận 1v1, hướng dẫn cốt truyện, xếp hạng, bot luyện tập, replay dạng dòng thời gian và công cụ theo dõi vận hành.

## Yêu cầu môi trường

- Node.js 22 trở lên.
- pnpm 9 qua Corepack.
- Docker Desktop nếu chạy PostgreSQL, Redis và bản staging HTTPS.

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

## Chạy phát triển

```bash
pnpm dev
```

- Game: http://localhost:5173
- Sức khỏe API: http://localhost:3000/health
- Sức khỏe máy chủ trận: http://localhost:3001/health

Mở hai tab với cùng mã phòng để thử PvP, ví dụ `http://localhost:5173/?room=NOVA`. Mở **Trung tâm > Thi đấu > Luyện tập với máy** để vào room bot tự động.

## Điều khiển

- `WASD`: di chuyển tướng; chuột: ngắm; `Shift`: lướt nhanh.
- Nhấp hoặc kéo chuột trái: chọn quân; giữ `Shift` để chọn thêm.
- Chuột phải: di chuyển đội hình hoặc tấn công mục tiêu.
- `Ctrl+1-5`: lưu nhóm; `1-5`: gọi nhóm.
- `H`, `X`, `R`: giữ vị trí, dừng, rút lui.
- `F`: đánh thường; `Q`: xung lực Aether; `E`: phát bắn xuyên phá; `C`: pháo sáng trinh sát.
- Con lăn: thu phóng; chuột giữa: kéo bản đồ; `Space`: đặt lại camera.
- `F1-F5`: chọn công trình rồi nhấp chuột trái để xây.
- `J/K/L/N/M/P`: huấn luyện kiếm sĩ, lính giáo, cung thủ, kỵ binh, quân quấy rối hoặc hộ vệ.
- `Z`: đổi đội hình; chuột phải lên công trình: đặt điểm tập kết; `O`: đầu hàng.

Rừng giảm khả năng bị phát hiện, đồi tăng tầm nhìn. Trận bắt đầu sau 5 giây, tạm dừng tối đa 30 giây khi mất kết nối và kết thúc khi nhà chính bị phá hoặc một bên đầu hàng.

## Hướng dẫn và tài khoản

**Trung tâm chỉ huy** có năm mục:

- **Hướng dẫn:** Chương 1 gồm 5 nhiệm vụ, trigger vùng, spawn wave, lựa chọn cốt truyện, lưu tiến trình và khởi động lại sạch.
- **Thi đấu:** tạo hồ sơ, đăng nhập, xem MMR, vào hàng chờ theo vùng/độ trễ hoặc luyện tập với bot.
- **Cài đặt:** âm thanh, hiệu ứng, giảm chuyển động, tương phản cao và cỡ giao diện.
- **Diễn biến:** timeline sự kiện trận hiện tại để xem lại các mốc chính.
- **Vận hành:** metrics độ trễ, lỗi, hàng chờ và danh sách trận gần nhất.

API chính: `/auth/register`, `/auth/login`, `/profile`, `/matchmaking/join`, `/matchmaking/status`, `/matches/result`, `/telemetry`, `/admin/metrics`, `/admin/matches` và `/config/balance`.

## Lưu kết quả

Khi có `DATABASE_URL`, máy chủ game tạo và ghi bảng PostgreSQL `match_results`. Khi phát triển không có PostgreSQL, kết quả được ghi vào `apps/game-server/data/matches.jsonl` và tệp này bị Git bỏ qua. Hồ sơ/xếp hạng Alpha đang giữ trong bộ nhớ API và sẽ mất khi tiến trình API khởi động lại.

## Kiểm thử chất lượng

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @aetherion/game-server smoke:realtime
pnpm --filter @aetherion/game-server test:load
```

Đổi số room tải bằng `ROOMS=50`. Bài mặc định dùng 20 room/40 kết nối.

## Staging Docker và HTTPS

```bash
docker compose up --build
```

Mở `https://localhost:8443`. Nginx dùng chứng chỉ tự ký cho staging local, phục vụ web và reverse proxy API/WebSocket. PostgreSQL và Redis cũng được khởi tạo trong Compose. Trình duyệt sẽ yêu cầu xác nhận chứng chỉ tự ký ở lần mở đầu tiên.

## Giới hạn Closed Alpha

- Hồ sơ, token, hàng chờ và MMR đang lưu trong bộ nhớ; cần PostgreSQL/Redis trước khi chạy nhiều instance production.
- Replay là timeline sự kiện, chưa phải mô phỏng lại từng tick.
- Cấu hình cân bằng có endpoint dữ liệu nhưng chưa có bảng quản trị để sửa từ xa.
- Âm thanh/VFX dùng hiệu ứng nguyên mẫu; cần asset hoàn chỉnh và playtest cân bằng.
- Cần đo thủ công 60 FPS trên thiết bị mục tiêu và kiểm thử tải lớn hơn trước khi mở Alpha công khai.
