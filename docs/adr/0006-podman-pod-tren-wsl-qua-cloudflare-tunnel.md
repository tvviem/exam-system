---
status: accepted
---

# Giai đoạn 1 chạy trên Podman pod ở WSL, ra Internet qua Cloudflare Tunnel

Hệ thống chạy trong một Podman pod rootless (`prod-exam`) trên máy WSL Ubuntu đang dùng để phát triển. Pod được điều khiển bằng `infra/Makefile` và `podman run`, giống `plo-tracker-bluni`, không dùng compose. Cloudflare Tunnel đang có trên máy cung cấp HTTPS công khai. Workflow GitHub Actions deploy qua một runner self-hosted riêng. Chọn cách này để tận dụng hạ tầng và quy trình đã vận hành ổn định, không tốn chi phí cloud trong lúc sản phẩm còn đang hoàn thiện. Vì không có object storage, ảnh được lưu trên volume sau interface `MediaStore`, để khi lên VPS có thể đổi sang S3/R2 mà không sửa nghiệp vụ.

## Consequences

- Độ sẵn sàng phụ thuộc vào một máy Windows: sleep, Windows Update hay mất điện đều làm gián đoạn Phiên thi. Đây là lý do chính để chuyển sang VPS khi hệ thống đã ổn định.
- Image, Makefile và env file được thiết kế để chạy giống nhau trên VPS.
