---
status: accepted
---

# Modular monolith TypeScript trong một monorepo

Backend là một ứng dụng NestJS duy nhất, chia module theo nghiệp vụ (identity, question-bank, exam, session, attempt, grading). Frontend là một ứng dụng React SPA dạng PWA, tách code theo route để trang làm bài của Người dự thi tải rất nhẹ. Cả hai nằm trong một monorepo pnpm, dùng chung gói schema Zod. Quy mô khoảng 2.000 Người dùng và 300 người đồng thời không cần microservices. Một ngôn ngữ cho toàn hệ thống giúp đội nhỏ vận hành và kiểm thử dễ hơn.

## Considered Options

- **Next.js full-stack**: chạy WebSocket lâu dài cho việc theo dõi Phiên thi kém thuận tiện; SSR không cần thiết vì hệ thống không phục vụ SEO.
- **Java/Spring hoặc .NET**: ổn định, nhưng phải dùng hai ngôn ngữ, mất khả năng dùng chung schema giữa client và server.
- **Microservices**: chi phí vận hành vượt quá nhu cầu.
