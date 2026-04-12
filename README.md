# Arunika Finance

Aplikasi keuangan online ringan untuk mencatat pemasukan dan pengeluaran, melihat ringkasan arus kas, lalu bertanya langsung ke chatbot keuangan berbasis data transaksi terbaru.

## Fitur utama

- Dashboard saldo, pemasukan, pengeluaran, rasio tabungan, dan insight otomatis.
- Login, register, logout, dan session cookie untuk memisahkan data tiap user.
- Database SQLite lokal di `data/arunika.sqlite`.
- Tabel transaksi dengan pencarian, filter tipe, dan hapus data.
- Integrasi Telegram bot untuk chat keuangan dari aplikasi Telegram.
- Chatbot keuangan:
  - Mode lokal aktif tanpa konfigurasi tambahan.
  - Mode AI aktif jika `OPENAI_API_KEY` diisi.

## Menjalankan aplikasi (lokal)

1. Buka terminal di folder proyek `d:\keuangan`.
2. Salin file environment:

```powershell
Copy-Item .env.example .env
```

3. Jalankan aplikasi:

```powershell
npm.cmd start
```

4. Buka browser ke `http://localhost:3000` (atau port dari env `PORT`).

Catatan:
- Saat `npm start` atau `npm run dev`, source frontend di `src/client/` otomatis dirakit lalu disinkronkan ke root assets (`index.html`, `styles.css`, `app.js`, dst.) dan ke folder `public/`.
- Backend menerapkan header keamanan HTTP, rate limit API, serta validasi origin untuk endpoint mutasi.
- Sebelum push ke GitHub, jalankan verifikasi cepat:

```powershell
npm.cmd run verify
```

Perintah ini akan menyinkronkan aset frontend, menjalankan test modul ringan, smoke test route penting, lalu mengecek sintaks file JavaScript utama.

## Struktur proyek

Source utama sekarang dipusatkan di folder `src/`:

```text
src/
  client/
    index.html
    styles.css
    transaction-categories.js
    transaction-amount.js
    app/
      core/
      render/
      transactions/
      actions/
      bootstrap.js
  server/
    app.js
    index.js
    auth/
    data/
    routes/
    services/
```

Catatan struktur:
- `src/client/` adalah source of truth frontend.
- `src/server/` adalah source of truth backend.
- File legacy seperti `server.js`, `server.next.js`, `database.js`, dan `database.next.js` sekarang hanya wrapper kompatibilitas.
- Root `app.js` dan asset frontend root lain adalah output sinkronisasi dari `src/client/`.

## Test ringan

Selain `verify`, tersedia juga test modul ringan untuk area yang paling rawan berubah:

```powershell
npm.cmd run test:light
```

Saat ini test ringan mencakup:
- parsing nominal fleksibel
- parser OCR receipt
- helper transaksi dasar

Smoke test route penting:

```powershell
npm.cmd run test:routes
```

Cakupannya:
- `GET /api/health`
- register + session auth
- proteksi endpoint transaksi
- buat transaksi + hitung summary

Flow Telegram OCR:

```powershell
npm.cmd run test:telegram
```

Cakupannya:
- foto struk Telegram -> OCR draft
- edit cepat draft (`kategori ...`, `merchant ...`, `catatan ...`)
- `lihat draft`
- `reset draft`
- `simpan`
- `batal`

## Environment test

Untuk isolasi data saat test atau eksperimen lokal, backend mendukung:

- `ARUNIKA_DATA_DIR`
- `ARUNIKA_DB_FILE`

Kalau env ini diisi, SQLite akan memakai lokasi data yang ditentukan tanpa mengganggu data utama aplikasi.

## Instal sebagai aplikasi HP (PWA)

Setelah aplikasi sudah live di domain HTTPS (Railway/hosting lain), aplikasi bisa diinstal ke HP:

1. Buka URL aplikasi di browser HP.
2. Android (Chrome): pilih menu -> `Install app` atau `Add to Home screen`.
3. iPhone (Safari): tap `Share` -> `Add to Home Screen`.
4. Jalankan dari ikon home screen seperti aplikasi native.

## Deploy ke Render (siap produksi)

Proyek ini sudah menyertakan blueprint [render.yaml](render.yaml) yang siap dipakai.

1. Push repository ke GitHub.
2. Di Render, pilih `New +` -> `Blueprint` -> pilih repository ini.
3. Pastikan service `arunika-finance` terbuat.
4. Isi environment variable berikut di Render:
   - Wajib untuk Telegram:
     - `APP_BASE_URL` = URL publik HTTPS aplikasi Render, contoh `https://arunika-finance.onrender.com`
     - `TELEGRAM_BOT_TOKEN` = token bot dari BotFather
   - Opsional:
     - `TELEGRAM_BOT_USERNAME`
     - `OPENAI_API_KEY` (kalau ingin mode AI OpenAI)
     - `ALLOWED_ORIGINS` (opsional, pisahkan dengan koma jika ada origin frontend tambahan)
5. Deploy service.
6. Verifikasi health check: `GET /api/health` harus status `ok`.

Opsional (direkomendasikan) sebelum deploy:

```powershell
npm.cmd run preflight
```

Perintah ini akan mengecek env penting untuk Telegram (`APP_BASE_URL`, `TELEGRAM_BOT_TOKEN`) dan menandai yang masih kosong.

Catatan penting deploy:
- Database SQLite disimpan di persistent disk Render pada path `data/`.
- Webhook Telegram akan dipasang otomatis saat startup jika:
  - `TELEGRAM_AUTO_SET_WEBHOOK=true`
  - `APP_BASE_URL` dan `TELEGRAM_BOT_TOKEN` valid

## Menghubungkan Telegram

1. Login ke dashboard web.
2. Buka panel Telegram lalu klik `Buat kode tautan`.
3. Kirim atau tempel kode tautan itu langsung ke bot Telegram.
4. Setelah terhubung, Anda bisa gunakan:
   - `/summary`
   - `/help`
   - pesan bebas untuk analisis keuangan
   - input transaksi dengan parsing teks seperti `pengeluaran 25000 makan siang kategori Makanan`

## Demo account

- Email: `demo@arunika.local`
- Password: `demo12345`

## Referensi OpenAI

- https://platform.openai.com/docs/api-reference/responses
- https://platform.openai.com/docs/models/gpt-4.1-mini

## Catatan teknis

- Proyek dibuat tanpa dependensi eksternal agar ringan.
- Backend menggunakan `node:sqlite` bawaan Node.js (masih experimental di Node 22).
