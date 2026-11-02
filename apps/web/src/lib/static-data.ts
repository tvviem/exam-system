import '@tanstack/react-router';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Trang rộng (theo dõi phòng thi, chấm bài, soạn câu hỏi, bảng kết quả): nội dung tràn tới 1600 px (Q107). */
    wide?: boolean;
    /** Màn làm bài: bỏ khung ứng dụng (thanh trên, thanh tab) để dành chỗ cho đồng hồ và nút Nộp bài (Q238). */
    bare?: boolean;
  }
}
