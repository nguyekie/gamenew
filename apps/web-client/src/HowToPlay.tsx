const guideSections = [
  {
    title: "Bắt đầu nhanh",
    items: [
      "Mở Trung tâm → Thi đấu → Luyện tập với máy để làm quen trước.",
      "Trong PvP, hai người nhập cùng một mã phòng rồi nhấn Vào phòng.",
      "Trận bắt đầu sau 5 giây. Phá Nhà chính của đối thủ để chiến thắng."
    ]
  },
  {
    title: "Camera và chọn quân",
    items: [
      "WASD di chuyển camera; con lăn để thu phóng; giữ chuột giữa để kéo bản đồ.",
      "Nhấp hoặc kéo chuột trái để chọn quân; giữ Shift để chọn thêm.",
      "Chuột phải xuống đất để di chuyển, hoặc lên kẻ địch để tấn công.",
      "Ctrl + 1–5 lưu nhóm quân; phím 1–5 gọi lại nhóm; Space đặt lại camera."
    ]
  },
  {
    title: "Chiến đấu",
    items: [
      "F đánh thường; Q dùng Xung lực Aether; E bắn xuyên phá; C bắn pháo sáng trinh sát.",
      "H giữ vị trí; X dừng; R rút lui; Z đổi đội hình; O đầu hàng.",
      "Rừng giúp khó bị phát hiện hơn, còn đồi tăng tầm nhìn."
    ]
  },
  {
    title: "Xây dựng và quân đội",
    items: [
      "F1–F5 chọn công trình, sau đó nhấp chuột trái để đặt xây.",
      "J/K/L/N/M/P huấn luyện lần lượt kiếm sĩ, lính giáo, cung thủ, kỵ binh, quân quấy rối và hộ vệ.",
      "Chuột phải lên công trình để đặt điểm tập kết cho quân mới."
    ]
  }
] as const;

export const HowToPlay = () => (
  <section className="quick-guide" aria-labelledby="quick-guide-title">
    <div className="quick-guide-heading">
      <div>
        <span className="guide-kicker">Dành cho người mới</span>
        <h2 id="quick-guide-title">Cách chơi Aetherion</h2>
      </div>
      <span className="win-condition">Mục tiêu: phá Nhà chính đối phương</span>
    </div>

    <div className="guide-sections">
      {guideSections.map((section, index) => (
        <details key={section.title} open={index === 0}>
          <summary>{section.title}</summary>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  </section>
);

