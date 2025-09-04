# LARISin (MVP) — Copilot Promosi UMKM

Generator caption lintas platform + poster (HTML→PNG) + kalender posting 7 hari.

## Fitur
- Form detail produk & toko (nama, harga, manfaat, audiens, alamat, WA).
- Generate **caption** untuk Instagram, WhatsApp, TikTok, Facebook, Threads, Marketplace (3 varian per platform).
- Generate **poster** dari template HTML dengan warna & rasio (1:1, 4:5, 9:16, 16:9).
- Generate **kalender 7 hari**.
- **Export ZIP** (captions.json, captions.txt, plan.json, dan aset PNG).
- **LLM opsional**: gunakan API OpenAI-compatible (Chat Completions). Tanpa API key, sistem memakai MOCK teks.

## Cara Menjalankan (Local)
1) Pastikan Node.js 18+ sudah terpasang.
2) Ekstrak repo ini, lalu jalankan:
```bash
npm install
cp .env.example .env   # isi LLM_API_KEY jika ada
npm start
```
3) Buka `http://localhost:3000` di browser.

> **Catatan Puppeteer:** Saat `npm install`, puppeteer akan mengunduh Chromium. 
Jika ingin pakai Chrome yang sudah terpasang, set env:
```
export PUPPETEER_SKIP_DOWNLOAD=1
export PUPPETEER_EXECUTABLE_PATH=/path/to/google-chrome
```
Lalu jalankan `npm install` lagi.

## Konfigurasi LLM (opsional)
- Edit `.env`:
```
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-xxxx
LLM_MODEL=gpt-4o-mini
```
Bisa juga pakai provider OpenAI-compatible lain (mis. OpenRouter) dengan menyesuaikan `LLM_BASE_URL` dan `LLM_MODEL`.

## Struktur
```
server.js                # Express API + renderer
public/index.html        # UI Tailwind (CDN)
public/outputs/          # file hasil (PNG/ZIP)
templates/               # (ruang untuk template lanjutan)
```

## Lisensi
MIT — gunakan, modifikasi, dan komersialkan sesuka Anda. Mohon tetap etis dan taati aturan platform.
