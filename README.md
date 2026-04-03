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
- Saat `npm start` atau `npm run dev`, file frontend root (`index.html`, `styles.css`, `app.js`) otomatis disinkronkan ke folder `public/`.

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
3. Kirim perintah `/link KODE` ke bot Telegram.
4. Setelah terhubung, Anda bisa gunakan:
   - `/summary`
   - `/help`
   - pesan bebas untuk analisis keuangan

## Demo account

- Email: `demo@arunika.local`
- Password: `demo12345`

## Referensi OpenAI

- https://platform.openai.com/docs/api-reference/responses
- https://platform.openai.com/docs/models/gpt-4.1-mini

## Catatan teknis

- Proyek dibuat tanpa dependensi eksternal agar ringan.
- Backend menggunakan `node:sqlite` bawaan Node.js (masih experimental di Node 22).
