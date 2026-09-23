# AGENTS.md - Operating Instructions (@diepxuan/dsh-zero-trust)

Operating instructions cho Bột trên dự án `@diepxuan/dsh-zero-trust`. Xem SOUL.md cho bản sắc, IDENTITY.md cho chi tiết identity.

---

## 0. Boot Sequence

Mỗi session PHẢI đọc theo đúng thứ tự trong SOUL.md §4:

1. **SOUL.md** → 2. **USER.md** → 3. **IDENTITY.md** → 4. **TOOLS.md** → 5. `memory/<hôm-nay>.md` → 6. `memory/<hôm-qua>.md` (nếu có) → 7. **MEMORY.md** (chỉ MAIN SESSION) → 8. **README.md**

KHÔNG chỉ đọc AGENTS.md rồi thao tác luôn. Nếu có xung đột, ưu tiên: chỉ dẫn mới nhất của Sếp → SOUL.md → USER.md → IDENTITY.md → AGENTS.md → tài liệu dự án còn lại.

---

## 1. Code Scope

Repo nhỏ — toàn bộ nguồn gồm 5 file:

| Ưu tiên | Vị trí | Ghi chú |
|---------|--------|---------|
| Chính | `lib/index.js`, `lib/patch.js` | host plugin + pure transforms |
| Hạn chế | `package.json`, `cordis.patch.yml` | metadata/exports/bundle wiring — chỉ sửa khi task yêu cầu rõ |
| Hạn chế | `README.md` | chỉ cập nhật khi cơ chế thật sự đổi |

### Code Architecture: quy tắc vá bắt buộc

- Transform là **pure function**, đặt ở `lib/patch.js`; `lib/index.js` chỉ lo locate anchor, apply idempotent, report.
- Chỉ neutralize đúng 2 gate đã mô tả trong README.md:
  - Gate 1: `<key>.isLoopback ? "host" : "memory"` trong `@deepseek-ai/dsh-client-ui-settings/lib/client.js`.
  - Gate 2: `<key>.isLoopback ? new SettingsDocumentStore(…) : void 0` trong `@deepseek-ai/dsh-client-ui-settings-general/lib/client.js`.
  Pattern neo vế phải của ternary, không phụ thuộc `<key>` (cover cả `connection.isLoopback` cũ và `ctx.remote.$host.isLoopback` mới). KHÔNG vá server-side Origin fence (`@deepseek-ai/dsh-client-connection`): upstream đã hỗ trợ `trustedHosts` và privileged plane đã dùng `browserAuth`.
- Trước khi ghi file phải qua `needsPatch()`; pattern KHÔNG còn match sau khi vá.
- Plugin KHÔNG tạo file backup `.bak-*`; rollback duy nhất = cài lại package DSH lấy nguồn gốc (README.md mục Rollback).
- KHÔNG thêm behavior mới (network call, telemetry, logic khác) vào file bị vá.
- KHÔNG thêm anchor đường dẫn mới ngoài 3 anchor hiện có nếu chưa đọc chứng thực thực tế.

---

## 2. Domain Knowledge (DSH)

- Nguồn sự thật: `README.md` của dự án + mã thật của các package đích (`dsh-client-ui-settings*`) trong checkout DSH: `/root/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`. KHÔNG bịa cấu trúc bên trong package DSH.
- Sau mỗi lần nâng cấp DSH (`npm i -g @deepseek-ai/dsh@latest`), gate gốc quay lại trong file mới — lần boot kế tiếp plugin tự vá lại. KHÔNG vá tay bằng sed/script thủ công.
- Web runtime đọc file client từ đĩa theo từng request → sau khi vá chỉ cần refresh trình duyệt (Ctrl+Shift+R), không cần restart service.
- Plugin chỉ là nửa client. Nửa edge (Cloudflare) phải đi kèm: ingress `httpHostHeader: "127.0.0.1"`, KHÔNG xoá header `Origin` ở edge (fence `/api` đọc nó), `dsh web --trusted-host dsh.diepxuan.io.vn`, Access Bypass cho `/manifest.webmanifest` + `/favicon.svg`. Chi tiết: README.md mục "Yêu cầu cấu hình edge".
- KHÔNG đề xuất hay thực hiện xoá bỏ bất kỳ lớp bảo vệ nào khác (Origin fence, cross-site/DNS-rebinding checks, `--trusted-host`, Cloudflare Access).

---

## 3. Git Discipline

- Remote: `git@github.com:diepxuan/dsh-zero-trust.git`, branch chính `main` (track `origin/main`). `.gitignore` hiện có: `node_modules/`, `*.log`.
- Mỗi task = 1 branch = 1 PR; KHÔNG commit thẳng lên `main`.
- Không tự push / tạo PR / merge; chỉ khi Sếp nói "push đi" / "Em tạo PR đi".
- Merge PR dùng `gh pr merge <N> --squash --delete-branch`, KHÔNG `git merge` local (trừ khi Sếp nói rõ cherry-pick / gộp branch / rebase local).

---

## 4. Task Completion Cycle

Khi nhận task, phải đi hết vòng đời:

1. **Đọc task + source** — README.md, mã trong `lib/`
2. **Audit** — xác định gate/anchor/target bị ảnh hưởng; đọc file thật trong profile nếu cần (read-only OK)
3. **Implement** — đúng scope, không bịa pattern mới ngoài thực tế code
4. **Self-review** — idempotency, backup, không đụng lớp bảo vệ khác
5. **Verification** — `node --check lib/index.js lib/patch.js`; thử transform trên bản sao trong `/tmp` (không ghi vào profile); đối chiếu report line kỳ vọng
6. **Review loop** — fix theo comment
7. **Documentation** — cập nhật README.md/MEMORY.md khi cơ chế đổi
8. **Báo cáo cuối** — bằng chứng cụ thể

### Guard rails

- Nếu thiếu dữ kiện: đọc source trước; nếu vẫn thiếu thì hỏi Sếp
- Khi gặp lỗi: dừng, phân tích nguyên nhân, không vá mù
- KHÔNG tự chạy các lệnh nhóm "Ghi cần xin phép" trong TOOLS.md (`systemctl restart dsh-web`, `dsh plugin … add/remove`, chạy patcher ghi vào profile)
- Definition of Done: diff sạch, syntax check pass, bằng chứng kiểm chứng rõ ràng
- Workspace nằm ở `/data/dsh-zero-trust/` — ngoài session workspace mặc định của runtime thì mọi thao tác ghi phải qua cơ chế escalation, xem TOOLS.md

---

## 5. Sub-Agents

- Gọi là **đệ**
- Mô tả rõ: mục tiêu, input, output, giới hạn quyền
- Đệ không được vượt quyền Bột, KHÔNG được tự thao tác ghi vào `/root/.dsh/` hay restart service
