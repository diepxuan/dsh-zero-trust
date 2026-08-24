# @diepxuan/dsh-zero-trust

Zero-trust remote access layer for the DeepSeek Harness web GUI. Cho phép dùng
toàn bộ chức năng (kể cả Settings, credentials) qua tên miền công khai đặt sau
Cloudflare Access, mà không cần SSH tunnel và không giảm cấu hình bảo mật của
DSH (vẫn giữ fence `--trusted-host`, vẫn chặn privileged methods từ origin lạ).

## Vấn đề gốc

Client DSH tự phát hiện "chạy local" bằng `connection.isLoopback`
(hostname của trình duyệt có phải loopback hay không). Khi mở GUI qua
`https://…` (origin không loopback), các gate sau bị tắt / chặn:

| # | Gói | Gate | Hậu quả |
|---|-----|------|---------|
| 1 | `@deepseek-ai/dsh-client-ui-settings` (2 chỗ) | `connection.isLoopback ? "host" : "memory"` | mirror settings rơi về scope "memory" |
| 2 | `@deepseek-ai/dsh-client-ui-settings-general` | `connection.isLoopback ? new SettingsDocumentStore(…) : void 0` | Settings General báo "settings are unavailable in this browser" |
| 3 | `@deepseek-ai/dsh-client-connection` (server) | fence `/api` chỉ so `Origin` với Host đã bị tunnel ghi đè thành `127.0.0.1` (`new URL(origin).host === hostUrl.host`) | mọi RPC mang `Origin: https://…` bị 403 — lý do phải có Transform Rule "Remove Origin" ở Cloudflare |
| 4 | `@deepseek-ai/dsh-client-connection` (server) | `PRIVILEGED_METHODS` gọi cùng fence với danh sách trust **rỗng** (pin loopback) | settings/credentials chỉ chạy được khi edge đã xoá hẳn header `Origin` |

Plugin này vô hiệu hóa đúng các gate đó: gate 1–2 phía client, còn gate 3–4
phía server được nới theo đúng nguyên tắc zero-trust — `Origin` whose
authority trùng một entry `trustedHosts` (tức domain đã khai báo
`--trusted-host`, đang đứng sau Cloudflare Access) thì được chấp nhận; origin
lạ vẫn bị chặn như cũ.

## Cơ chế

Bundle chuẩn của DSH profile (`dsh.bundle.patch`), gồm:

- `cordis.patch.yml` — insert một loader row `zero-trust` mount gói này.
- `lib/index.js` — host plugin: mỗi lần boot, tìm 3 package đích theo các
  anchor (`$DSH_HOME/profiles/node_modules`, resolve từ cwd, từ vị trí cài
  plugin) và vá file bundle nếu còn gate:
  - `dsh-client-ui-settings/lib/client.js` + `dsh-client-ui-settings-general/lib/client.js`
    (client) — hiệu lực ngay sau khi refresh trình duyệt, không cần restart;
  - `dsh-client-connection/lib/index.js` (server) — cần restart DSH một lần
    để code mới vào bộ nhớ.
  Idempotent — pattern không còn khớp trên nguồn đã vá nên chạy lại là no-op.
  Lưu ý: plugin hiện KHÔNG tạo file backup `.bak-*`; muốn về nguồn thật sự
  thì cài lại package DSH (xem Rollback).
- Web runtime đọc file client trực tiếp từ đĩa theo từng request → phần client
  chỉ cần refresh trình duyệt (Ctrl+Shift+R).

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

Chỉ muốn tách phần Origin (giữ phần settings client) thì sửa `TARGETS` trong
`lib/index.js`, bỏ row `@deepseek-ai/dsh-client-connection`.

## Yêu cầu cấu hình edge (Cloudflare) đi kèm

Từ v0.2.0, plugin tự xử lý header `Origin` phía server — **không còn cần
Transform Rule "Remove Origin"**; có thể xoá rule đó trên Cloudflare. Trình tự
an toàn: restart DSH để plugin vá server TRƯỚC, rồi mới xoá rule ở edge.

1. Tunnel ingress: `dsh.diepxuan.io.vn` → `http://127.0.0.1:3080`,
   `httpHostHeader: "127.0.0.1"`.
2. ~~Transform Rule Remove request header `Origin`~~ — **bỏ từ v0.2.0**:
   fence `/api` đã chấp nhận `Origin` khớp entry `trustedHosts`.
3. `dsh web --trusted-host dsh.diepxuan.io.vn` — **bắt buộc giữ nguyên**: bản
   vá Origin nhận diện domain công khai qua chính danh sách này; bỏ nó thì
   RPC qua domain public sẽ 403 trở lại.
4. Access Bypass app cho `/manifest.webmanifest` và `/favicon.svg`
   (Self-hosted, Path = path đó, Action = Bypass, Include Everyone) để hết
   lỗi CORS manifest trong console.

## Bảo mật

- Gate 1–2 chỉ bỏ điều kiện "browser origin là loopback"; gate 3–4 nới fence
  server theo whitelist: `Origin` phải có authority TRÙNG một entry
  `trustedHosts` đã khai báo. Origin lạ, cross-site (`sec-fetch-site:
  cross-site`) và DNS-rebinding vẫn bị chặn y như trước.
- Plane đặc quyền (settings/credentials/`llm.discoverModels`) giờ chấp nhận
  browser đến từ domain trusted-host — tức đã đi qua Cloudflare Access. Đây
  là thiết lập MẠCH HẸN so với trạng thái cũ dùng Transform Rule: trước đây
  mọi request bị edge xoá `Origin` đều trông như non-browser và đều pass;
  bây giờ chỉ origin đúng domain khai báo mới pass.
- Cloudflare Access tiếp tục là cổng duy nhất của tên miền public; `--trusted-host`
  là điều kiện kiện toàn của bản vá này.
