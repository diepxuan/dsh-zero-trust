# @diepxuan/dsh-zero-trust

Zero-trust remote access layer for the DeepSeek Harness web GUI. Cho phép dùng
toàn bộ chức năng (kể cả Settings, credentials) qua tên miền công khai đặt sau
Cloudflare Access, mà không cần SSH tunnel và không giảm cấu hình bảo mật của
DSH (vẫn giữ fence `--trusted-host`, vẫn chặn privileged methods từ origin lạ).

## Vấn đề gốc

Client DSH tự phát hiện "chạy local" bằng `isLoopback` trên context kết nối
(hostname của trình duyệt có phải loopback hay không). Khi mở GUI qua
`https://…` (origin không loopback), hai gate sau bị tắt:

| # | Gói | Gate | Hậu quả |
|---|-----|------|---------|
| 1 | `@deepseek-ai/dsh-client-ui-settings` | `…isLoopback ? "host" : "memory"` | mirror settings rơi về scope "memory" → Settings UI báo "settings are unavailable" |
| 2 | `@deepseek-ai/dsh-client-ui-settings-general` | `…isLoopback ? new SettingsDocumentStore(…) : void 0` | Settings General báo "settings are unavailable in this browser" |

Plugin này vô hiệu hóa đúng hai gate đó. Origin fence phía server
(`@deepseek-ai/dsh-client-connection`) hiện nay đã chấp nhận header `Origin`
có authority khớp một entry `trustedHosts` (tức domain đã khai báo
`--trusted-host`), nên không còn gate nào phía server cần plugin xử lý;
privileged plane nay dùng `browserAuth` thay vì pin loopback. Nếu DSH tương
lai tái nhập một gate mới, bổ sung transform tương ứng vào `lib/patch.js`.

## Cơ chế

Bundle chuẩn của DSH profile (`dsh.bundle.patch`), gồm:

- `cordis.patch.yml` — insert một loader row `zero-trust` mount gói này.
- `lib/index.js` — host plugin: mỗi lần boot, tìm 2 package UI settings theo
  các anchor (`$DSH_HOME/profiles/node_modules`, resolve từ cwd, từ vị trí cài
  plugin) và vá file `lib/client.js` nếu còn gate. Idempotent.
- `lib/patch.js` — pure transforms. Pattern chỉ neo vế phải của ternary
  (`? "host" : "memory"` / `? new SettingsDocumentStore(…) : void 0`) nên
  không phụ thuộc key `isLoopback` phía bên trái — survive cả dạng cũ
  (`connection.isLoopback`) lẫn dạng mới (`ctx.remote.$host.isLoopback`)
  giữa các bản DSH.
- Web runtime đọc file client trực tiếp từ đĩa theo từng request → sau khi
  vá, chỉ cần refresh trình duyệt (Ctrl+Shift+R), không cần restart.
- Plugin KHÔNG tạo file backup `.bak-*`; rollback = cài lại package DSH lấy
  nguồn gốc (xem Rollback).

## Cài vào profile web

```sh
dsh plugin --profile web add /data/dsh-zero-trust
systemctl restart dsh-web   # kích hoạt bundle (lưu ý: kết thúc session agent đang chạy trong dsh-web)
```

Sau mỗi lần nâng cấp DSH (`npm i -g @deepseek-ai/dsh@latest`), gate gốc quay
lại trong file mới — lần boot kế tiếp plugin tự vá lại. Không cần chạy script
thủ công.

## Chạy thủ công (không qua plugin)

```sh
node /data/dsh-zero-trust/lib/index.js
```

## Rollback

Plugin không giữ bản `.bak` — hoàn tác bằng cách cài lại package DSH để lấy
nguồn gốc, rồi gỡ bundle trước khi boot kế tiếp (nếu không plugin sẽ vá lại):

```sh
npm i -g @deepseek-ai/dsh@latest          # ghi đè toàn bộ file gốc
dsh plugin --profile web remove @diepxuan/dsh-zero-trust
systemctl restart dsh-web
```

## Yêu cầu cấu hình edge (Cloudflare) đi kèm

Nửa edge phải bảo đảm request tới origin mang Host `127.0.0.1` và có
`Origin: https://dsh.diepxuan.io.vn` (tức không xoá header Origin):

1. Tunnel ingress: `dsh.diepxuan.io.vn` → `http://127.0.0.1:3080`,
   `httpHostHeader: "127.0.0.1"`.
2. `dsh web --trusted-host dsh.diepxuan.io.vn` — **bắt buộc giữ nguyên**:
   Origin fence chỉ chấp nhận `Origin` khớp entry `trustedHosts`, mà
   `--trusted-host` chính là nguồn danh sách đó; bỏ nó thì RPC qua
   domain public sẽ 403.
3. Access Bypass app cho `/manifest.webmanifest` và `/favicon.svg`
   (Self-hosted, Path = path đó, Action = Bypass, Include Everyone) để hết
   lỗi CORS manifest trong console.

## Bảo mật

- Plugin chỉ bỏ điều kiện "browser origin là loopback" trên 2 client gate
  của Settings. Các lớp phòng vệ khác giữ nguyên: Origin fence vẫn chỉ chấp
  nhận `Origin` khớp entry `trustedHosts`; cross-site (`sec-fetch-site:
  cross-site`) và DNS-rebinding vẫn bị chặn y như trước.
- Cloudflare Access tiếp tục là cổng duy nhất của tên miền public; `--trusted-host`
  là điều kiện kiện toàn của bản vá.