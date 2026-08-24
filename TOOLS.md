# TOOLS.md - Local Notes (@diepxuan/dsh-zero-trust)

File này ghi chú các chi tiết riêng của môi trường `@diepxuan/dsh-zero-trust`. Skill và protocol dùng chung nằm ở nơi khác; file này chỉ giữ thông tin cần thiết cho workspace này.

## Nguyên tắc

- Không lưu bí mật, token, mật khẩu hoặc dữ liệu nhạy cảm.
- Không ghi lại hướng dẫn chung có thể sống trong skill/plugin.
- Khi thêm tool mới, ghi rõ phạm vi áp dụng và cách nhận diện.

## Môi trường DSH

| Thành phần | Giá trị | Ghi chú |
|------------|---------|---------|
| Checkout DSH | `/root/.npm-global/lib/node_modules/@deepseek-ai/dsh/` | đọc mã nguồn DSH chuẩn |
| Package đích bị vá | `/root/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` | chứa `dsh-client-ui-settings*`, `dsh-client-connection` — vùng ghi NHẠY CẦM |
| Profile web | `/root/.dsh/profiles/web/` | bundle `@diepxuan/dsh-zero-trust` mount tại đây (`dsh.profile.bundles`) |
| Service | systemd unit `dsh-web` | `DSH_HOME=/root/.dsh`, cwd `/root/.openclaw`; restart giết session agent đang chạy trong service |

## Vòng đời plugin (tóm tắt vận hành)

1. Mount qua `cordis.patch.yml` (loader row `zero-trust`) sau khi `dsh plugin --profile web add /data/dsh-zero-trust`.
2. Mỗi boot: `apply()` → `resolveTargetClient()` theo 3 anchor (`$DSH_HOME/profiles/node_modules`, resolve từ cwd, vị trí cài plugin) → `needsPatch()` ? transform + write : SKIP/OK.
3. Report line ghi ra stderr → xem bằng chứng bằng `journalctl -u dsh-web`.
4. Rollback: cài lại package DSH (`npm i -g @deepseek-ai/dsh@latest`) lấy nguồn gốc, rồi gỡ bundle theo README.md (plugin không tạo `.bak`).

## Phân nhóm lệnh theo quyền

**Read-only (KHÔNG cần hỏi Sếp — chạy luôn):**

- `cat`, `head`, `tail`, `grep`, `rg`, `diff`, `ls`, `stat` — đọc/so sánh file
- `node --version`, `node --check lib/index.js lib/patch.js` — syntax check
- `git status/log/diff/show` (nếu đã có repo)
- `systemctl status dsh-web` — xem trạng thái, không mutate
- `journalctl -u dsh-web` — đọc log service
- `curl` GET (không mutate)

**Ghi local trong workspace `/data/dsh-zero-trust/` (KHÔNG cần hỏi Sếp):**

- Tạo/sửa file dự án bằng write/edit tool
- `mkdir`, `cp`, `mv` trong thư mục dự án
- Thử nghiệm transform trên bản sao đặt trong `/tmp` (KHÔNG ghi vào profile)

**Ghi cần xin phép Sếp (chỉ chạy khi được approval):**

- `node lib/index.js` (CLI standalone) — ghi đè file trong `/root/.dsh/profiles/`
- `systemctl restart/reload/stop/start dsh-web` — kết thúc session agent đang chạy trong service
- `dsh plugin --profile web add/remove /data/dsh-zero-trust` — thay đổi bundle profile
- `git push`, `gh pr create/edit`, `gh pr merge/close` — thao tác remote/GitHub; chỉ khi Sếp ra lệnh ("push đi", "Em tạo PR đi", "merge")
- `npm install/publish`, tải package, gọi API mutation bên ngoài
- Mọi lệnh ghi ra ngoài workspace (`/root/.dsh/`, `/etc/systemd/`, ...)
- Bất kỳ lệnh nào fail do sandbox/network/permission nhưng vẫn cần chạy để hoàn thành task

## Sandbox & Escalation

- Runtime có thể giới hạn ghi trong session workspace mặc định; workspace này thường nằm ngoài vùng đó (ví dụ `/data/dsh-zero-trust/`). Khi thao tác ghi bị từ chối: DỪNG, không né sandbox, retry đúng một lần với cơ chế escalation mà runtime cung cấp (`sandbox_permissions` + justification), chờ Sếp duyệt.
- Justification: tiếng Việt, 1 dòng, nêu rõ lệnh/mục đích/phạm vi, dạng câu hỏi cho Sếp; văn bản thuần, không markdown/code fence.
- Sau khi được duyệt: chỉ chạy đúng phạm vi đã xin; báo lại kết quả (file đổi, exit code, output quan trọng).

### Quy tắc khi lệnh gặp lỗi

- DỪNG, không tự ý retry bằng flag né sandbox.
- Báo cáo Sếp: lệnh đã chạy, exit code, stderr/output quan trọng, nghi vấn nguyên nhân.
- Xin approval escalated nếu vẫn cần chạy để hoàn thành task.

## Lưu ý verify sau khi vá

- Gate 1–2 (client) sau khi vá hiệu lực ngay ở request kế tiếp: yêu cầu Sếp refresh trình duyệt (Ctrl+Shift+R); KHÔNG tự restart `dsh-web`.
- Gate 3–4 (`dsh-client-connection`, server) cần restart `dsh-web` một lần để code vá vào bộ nhớ — chỉ restart khi Sếp duyệt.
- Bằng chứng vá thành công lấy từ report line trong `journalctl -u dsh-web` (PATCH/SKIP/OK per package).
