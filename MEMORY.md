# @diepxuan/dsh-zero-trust — Long-term Memory

Memory dài hạn cho Bột trên dự án `@diepxuan/dsh-zero-trust`. Mỗi entry khi có thay đổi cơ chế, sự cố hay bài học đều ghi vào đây. Đọc MEMORY.md trước mọi task lớn để không lặp lại lỗi cũ.

Cập nhật lần cuối: khởi tạo cùng bộ 8 file instruction (theo yêu cầu Sếp).

---

## 0. Quy tắc cố định (không theo task, theo SOUL.md/AGENTS.md/TOOLS.md)

- Patch idempotent; luôn qua `needsPatch()` trước khi ghi file đích.
- Plugin KHÔNG tạo backup `.bak`; rollback duy nhất = cài lại package DSH lấy nguồn gốc (quyết định của Sếp khi sync instruction v0.2).
- Chỉ neutralize đúng 2 gate loopback theo README: gate 1 settings scope, gate 2 general document store; pattern neo vế phải, key-agnostic; KHÔNG vá server (Origin fence đã hỗ trợ trustedHosts upstream, privileged plane đã dùng browserAuth). Mọi lớp bảo vệ khác (Origin fence, cross-site/DNS-rebinding, `--trusted-host`, Cloudflare Access) bất biến.
- KHÔNG tự `systemctl restart dsh-web` — giết session agent đang chạy trong service.
- KHÔNG tự chạy patcher ghi vào `/root/.dsh/profiles/` — cần Sếp duyệt.
- Remote `git@github.com:diepxuan/dsh-zero-trust.git`, branch `main`; mỗi task = 1 branch = 1 PR, không commit thẳng `main`, không tự push/PR/merge.

---

## 1. Nhật ký thay đổi

### Sync instruction với thực trạng v0.2.0

- Sếp yêu cầu review lại toàn bộ instruction; phát hiện 3 nhóm lệch: (1) sai đường dẫn package bị vá — thật ra nằm trong checkout DSH `/root/.npm-global/.../dsh/node_modules/@deepseek-ai/`, không phải `/root/.dsh/profiles/node_modules/`; (2) instruction còn yêu cầu backup `.bak` + Transform Rule Remove Origin trong khi v0.2.0 đã bỏ cả hai; (3) ghi "3 gate" trong khi code là 4 nhóm gate.
- Quyết định Sếp: instruction bám theo README/code; bỏ backup (rollback = cài lại package DSH); remote giữ SSH.
- Đã sửa AGENTS/SOUL/IDENTITY/TOOLS/MEMORY/CLAUDE + README, tạo branch `docs/instruction-sync-v0.2` và PR cho Sếp review.

### Khởi tạo bộ instruction files

- Sếp yêu cầu kiểm tra bộ nội dung dự án của Portal rồi viết tương tự cho `dsh-zero-trust`.
- Đã tạo 8 file đối chiếu chuẩn Portal: `AGENTS.md`, `SOUL.md`, `USER.md`, `IDENTITY.md`, `TOOLS.md`, `HEARTBEAT.md`, `MEMORY.md`, `CLAUDE.md`.
- Persona: dùng chung **Bột** với Portal Agent (Sếp chọn). Workspace: `/data/dsh-zero-trust/`.
- Boot sequence thêm bước đọc `README.md` làm nguồn sự thật về cơ chế plugin/cài đặt/rollback/edge.

---

## 2. Tasks done

- v0.2.0: vá thêm gate 3–4 (Origin fence + privileged plane trong `dsh-client-connection`) để bỏ Transform Rule Remove Origin ở Cloudflare.
- Khởi tạo repo git, first commit `00e1047` lên `main` và push origin (theo lệnh trực tiếp của Sếp).
- Sync instruction files với v0.2.0 (PR #1 merged `c8ea873`).
- v0.3.0: re-audit thực tế phát hiện DSH upstream đã sửa Origin fence và bỏ `PRIVILEGED_METHODS`. Thu hẹp plugin về 2 client gate, regex neo vế phải (key-agnostic qua cả `connection.isLoopback` và `ctx.remote.$host.isLoopback`). Đồng bộ README + toàn bộ instruction files.

---

## 3. Bài học rút ra

(trống)

---

## 4. Backlog / Open questions

- Anchor resolve của plugin nghi vấn không trúng package thật: unit `dsh-web` chạy với `DSH_HOME=/root/.dsh` + cwd `/root/.openclaw`, cả 3 anchor hiện có đều không dẫn tới checkout global `/root/.npm-global/.../@deepseek-ai/`. Cần mô phỏng resolve trong môi trường systemd và cân nhắc thêm anchor checkout (đã đủ chứng thực thực tế theo AGENTS.md §1).
- Sau khi áp v0.3.0: confirm end-to-end qua `https://dsh.diepxuan.io.vn` — mở Settings, mở Credentials xem persistence = "host" và document store hoạt động (cần Sếp duyệt chạy `node lib/index.js` + `systemctl restart dsh-web` vì anchor resolve còn nghi vấn).
