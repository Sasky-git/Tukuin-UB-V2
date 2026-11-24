# TUKUIN UB — PANDUAN DARI NOL (VERSI GRATIS UNTUK TUGAS KELAS)

> Sumber tampilan: `index(4).html` yang kamu kirim. Layout Tukuin, warna, kategori, katalog, modal jual, chat, profile, dan dashboard admin dipertahankan. Bagian yang diubah adalah login simulasi menjadi Google Login, database demo menjadi Firestore, dan upload foto ke Cloudinary Free (bukan Firebase Storage). Wajib diisi konfigurasi akunmu sebelum fitur online bisa berfungsi.

## 0. Hasil akhir dan layanan

- Web **Netlify Free** → HTML statis + Netlify Functions yang mengamankan perintah database.
- Login **Google** melalui **Firebase Authentication Spark**.
- **Cloud Firestore Spark** sebagai database utama `users`, `privateUsers`, `products`, `productContacts`, `orders`, `reports`, `notifications`, `activity`.
- **Cloudinary Free** menyimpan foto. Firestore menyimpan URL foto.
- **Google Sheets** menjadi **rekap** yang disalin dari Firestore (bukan database utama). Rekap otomatis setiap 15 menit via Netlify Scheduled Function, atau manual dari dashboard admin > Aktivitas > **Sinkronkan Google Sheets**. Jadwal bisa dinonaktifkan dengan menghapus file `netlify/functions/sync-scheduled.mjs`.
- **GitHub Free** menyimpan kode; **VS Code** untuk mengedit; semua tanpa mengaktifkan *billing* Firebase / Google Cloud.

Penting: gratis berlaku **selama di dalam kuota free**, dan layanan bisa membatasi/menghentikan akses setelah batas tercapai. Untuk tugas kelas dengan sedikit pengguna, lazimnya cukup; tidak ada jaminan nol error sebelum dites dengan kredensial dan akun asli.

## 1. Struktur folder — jangan ubah nama folder/file

```text
tukuin-ub-free/
├─ public/
│  ├─ index.html              <- layout Tukuin asli (hanya alur login dimodifikasi)
│  ├─ firebase-config.js      <- wajib isi config Web App Firebase (boleh publik)
│  └─ integration.js          <- penghubung login, produk, transaksi, admin
├─ netlify/
│  └─ functions/
│     ├─ api.mjs              <- verifikasi token + semua operasi (aman)
│     └─ sync-scheduled.mjs   <- rekap Sheets setiap 15 menit
├─ server/
│  └─ shared.mjs              <- Firebase Admin + Google Sheets API
├─ scripts/
│  └─ check.mjs              <- pemeriksaan file dasar
├─ firestore.rules           <- aturan keamanan database
├─ netlify.toml              <- build dan fungsi backend
├─ package.json              <- library server
├─ .env.example              <- daftar nama konfigurasi RAHASIA
├─ .gitignore                <- menghindari upload rahasia
└─ PANDUAN_LENGKAP.md
```

**Jangan** upload `service-account*.json`, Firebase Admin private key, Cloudinary API Secret, atau `.env` ke GitHub. File `public/firebase-config.js` memang memakai API key Web Firebase yang **bukan** service-account private key. Tetap lindungi data dengan `firestore.rules`.

## 2. Instal software

1. [VS Code](https://code.visualstudio.com/)
2. [Git untuk Windows](https://git-scm.com/download/win)
3. [Node.js LTS 22](https://nodejs.org/en) (paket project memakai Node 22).
4. Browser Chrome atau Edge.

Buka VS Code → **File > Open Folder** → pilih folder yang berisi `package.json`. Buka **Terminal > New Terminal**. Jalankan di terminal **PowerShell**:

```powershell
node --version
git --version
npm --version
npm install
npm run check
```

`npm install` mengunduh library backend; pastikan komputer tersambung internet. Jika `node` tidak dikenali, tutup VS Code lalu buka kembali setelah install Node.

## 3. Buat Firebase Spark (tanpa billing)

1. Masuk ke <https://console.firebase.google.com/> → **Add project / Buat project**.
2. Nama contoh `Tukuin UB Kelas`. Firebase **Project ID** biasanya otomatis dibuat dan harus unik, misalnya `tukuin-ub-kelas-12345`. Catat **Project ID yang betul**. Nama repo GitHub dan nama Netlify **boleh berbeda**.
3. Jangan klik Upgrade to Blaze. **Spark** saja.
4. **Build > Authentication > Get started > Sign-in method > Google > Enable**. Pilih email dukungan proyek lalu Save.
5. **Build > Firestore Database > Create database** → pilih Standard (jika diminta), pilih lokasi, **Start in production mode**, lalu Create. Pilih lokasi dekat Indonesia bila tersedia.
6. Di **Firestore Database > Rules**, salin *semua isi* `firestore.rules` ke editor dan klik **Publish**. Jangan gunakan aturan `allow read, write: if true`.
7. **Project overview > ikon gear > Project settings > General > Your apps**. Klik ikon **</> Web**, beri nama `tukuin-web`, Register app. Pada **SDK setup and configuration** pilih **Config**, salin objek `firebaseConfig`.
8. Buka `public/firebase-config.js`. Ganti placeholder memakai nilai **asli** dari Firebase. Contoh STRUKTUR saja (BUKAN nilai yang bisa langsung dipakai):

```javascript
window.TUKUIN_FIREBASE_CONFIG = {
  apiKey: 'AIza...NILAI_DARI_FIREBASE',
  authDomain: 'ID-PROJECT-MU.firebaseapp.com',
  projectId: 'ID-PROJECT-MU',
  messagingSenderId: 'ANGKA_DARI_FIREBASE',
  appId: '1:ANGKA:web:KODE_DARI_FIREBASE'
};
```

Tidak perlu `storageBucket`, karena gambar disimpan di Cloudinary. `measurementId` juga tidak dibutuhkan.

9. Untuk backend, pada **Project settings > Service accounts > Firebase Admin SDK**, klik **Generate new private key** → simpan file JSON *di luar folder project*; buka file JSON sementara untuk melihat `project_id`, `client_email`, dan `private_key`. **Jangan** masukkan JSON/file ini ke folder GitHub, dan **jangan** letakkan `private_key` di `index.html` atau `firebase-config.js`.

## 4. Buat Cloudinary Free untuk foto barang

1. Buka <https://cloudinary.com/pricing> → daftar **Free**.
2. Pada Cloudinary Console, buka halaman **API Keys / Settings** (menu bisa berbeda). Catat `Cloud Name`, `API Key`, `API Secret`.
3. Nilai tersebut **tidak** dimasukkan ke HTML. Simpan semuanya di **Netlify Environment variables** (langkah 7).
4. Ketika mahasiswa menekan **Pilih Foto** lalu **Simpan & Tayangkan**, browser meminta *signature* dari Netlify Function (setelah token Google diverifikasi), mengupload JPG/PNG/WebP maksimal 5 MB ke Cloudinary, dan backend menyimpan URL fotonya ke Firestore.
5. Foto harus benar-benar dipilih untuk produk baru. Ilustrasi demo tidak dianggap foto upload.

## 5. Buat Google Sheets sebagai rekap

1. Buka <https://sheets.google.com> → Blank Spreadsheet. Nama contoh **Tukuin - Database Kelas**.
2. URL spreadsheet seperti `https://docs.google.com/spreadsheets/d/1abcDEF123xxx/edit#gid=0`. Salin bagian di antara `/d/` dan `/edit`: itu `GOOGLE_SHEET_ID`.
3. Klik **Share / Bagikan**, masukkan alamat `client_email` dari service account JSON Firebase di langkah 3, beri akses **Editor** → Send. Pastikan yang dibagikan adalah **Sheet tersebut**, tidak harus publik.
4. Buka <https://console.cloud.google.com/apis/library/sheets.googleapis.com> → pastikan project Google Cloud yang dipilih sama dengan **Firebase Project ID** → klik **Enable** untuk **Google Sheets API**. Penggunaan standar API umumnya tidak dikenai biaya dalam kuota normal; **jangan** mengaktifkan Cloud Billing demi tugas ini. Jika diminta menautkan billing, hentikan dan gunakan rekap manual sebagai cadangan.
5. Setelah Netlify terkonfigurasi dan owner sudah menjadi admin, login admin → **Dashboard Admin > Aktivitas > Sinkronkan Google Sheets**.
6. Lima tab akan dibuat otomatis: **Pengguna**, **Produk**, **Pesanan**, **Laporan**, **Aktivitas**. Setiap sinkronisasi, isi tab itu diperbarui dari Firestore. **Jangan** edit tab ini untuk mencoba mengubah database; arah sinkronisasi satu arah: Firestore → Sheets.
7. Data nama, email, NIM, dan WhatsApp ada di tab Pengguna. Simpan Sheet sebagai **privat** dan batasi aksesnya kepada dosen/tim yang berwenang.

## 6. Buat repository GitHub dari terminal VS Code

1. Buka <https://github.com/new>, Repository name contoh `tukuin-ub-free`, pilih **Private** (lebih aman untuk tugas), **jangan centang** *Initialize with README*, Create repository.
2. Di VS Code buka **Terminal > New Terminal**; pastikan terminal sudah di folder project yang berisi `package.json`.
3. Ketik satu per satu:

```powershell
pwd
npm install
npm run check
git init
git config user.name "NAMA_KAMU"
git config user.email "EMAIL_GITHUB_KAMU"
git add .
git commit -m "Tukuin UB: login Google, database, foto, dashboard admin"
git branch -M main
git remote add origin https://github.com/USERNAME_GITHUB/tukuin-ub-free.git
git push -u origin main
```

Ganti `NAMA_KAMU`, `EMAIL_GITHUB_KAMU` dan `USERNAME_GITHUB`. Saat diminta login GitHub, ikuti jendela browser. **Tidak perlu mengganti Project ID Firebase mengikuti nama GitHub.**

Periksa yang akan diupload sebelum `git add .` dengan `git status`. Jika muncul `service-account.json` atau `.env`, **BERHENTI**, pindahkan/hapus dari folder sebelum commit.

Jika ada perubahan kode kemudian hari:

```powershell
git add .
git commit -m "Perbaikan Tukuin"
git push origin main
```

Jika error `remote origin already exists`, **jangan** `git init` ulang; jalankan `git remote -v` dan, jika salah, `git remote set-url origin https://github.com/USERNAME_GITHUB/tukuin-ub-free.git`.

## 7. Hubungkan GitHub ke Netlify Free

1. Buka <https://app.netlify.com/> → login memakai GitHub → buat site dengan **Add new project > Import an existing project** (tampilan menu bisa berubah).
2. Pilih GitHub → repo `tukuin-ub-free` → branch `main`.
3. Pastikan pengaturan build:

```text
Base directory:        (kosong)
Build command:         npm run build
Publish directory:     public
Functions directory:   netlify/functions
Node version:          22   (sudah ditetapkan di netlify.toml)
```

4. Sebelum atau sesudah deploy pertama, buka **Project configuration / Site configuration > Environment variables** → tambahkan (scope Functions/All jika tersedia):

| Nama variabel | Nilai dari mana? |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `project_id` dari Firebase service account JSON |
| `FIREBASE_CLIENT_EMAIL` | `client_email` dari service account JSON |
| `FIREBASE_PRIVATE_KEY` | `private_key` dari JSON, lengkap BEGIN/END PRIVATE KEY; boleh berisi `\n` literal |
| `GOOGLE_SHEET_ID` | ID URL Google Sheets |
| `CLOUDINARY_CLOUD_NAME` | Cloud Name dari Cloudinary |
| `CLOUDINARY_API_KEY` | API Key dari Cloudinary |
| `CLOUDINARY_API_SECRET` | API Secret dari Cloudinary |
| `ALLOWED_EMAIL_DOMAINS` | `student.ub.ac.id,ub.ac.id` **atau** `*` (semua akun Google untuk tugas kelas) |

Untuk tugas kelas yang memakai akun Gmail masing-masing, isi `ALLOWED_EMAIL_DOMAINS` = `*`. Untuk membatasi ke email kampus UB, isi `student.ub.ac.id,ub.ac.id`. Pembatasan ini **berlaku di server**, bukan sekadar tampilan login.

**Tips private key:** Buka JSON dan ambil **nilai string `private_key` saja**, contohnya `-----BEGIN PRIVATE KEY-----\nABCD...\n-----END PRIVATE KEY-----\n`. Jangan ikut menyalin tanda petik JSON luar. Jangan kirim private key ke chat/teman. Setelah mengganti environment variables klik **Deploys > Trigger deploy > Deploy site** agar Functions membaca konfigurasi baru.

5. Setelah sukses, Netlify memberi URL contoh `https://tukuin-ub-free.netlify.app`. **Catat URL aslinya**, bukan harus sama dengan nama project Firebase.
6. Buka Firebase **Authentication > Settings > Authorized domains** → **Add domain** → masukkan hanya hostname Netlify milikmu, **tanpa `https://` dan tanpa `/`**, misalnya `tukuin-ub-free.netlify.app`.
7. Untuk tes localhost, tambahkan `localhost` bila belum ada (Firebase project baru bisa tidak menambahkannya otomatis).

## 8. Jadikan akun owner sebagai admin dengan benar

1. Buka URL Netlify Tukuin dan login dengan **akun Google yang akan jadi owner**.
2. Pastikan muncul nama pengguna dan klik Profil; isi WhatsApp/NIM (NIM hanya isi sendiri, **bukan** verifikasi akademik otomatis).
3. Firebase Console → **Authentication > Users** → temukan akun owner → catat **User UID**.
4. Firebase Console → **Firestore Database > Data > collection `users` > document UID tersebut**.
5. Edit field `role` (tipe **string**) dari `student` menjadi **`admin`**. Jangan mengubah field `id`, `status`, atau document ID.
6. Refresh website atau keluar lalu login kembali. Menu **Dashboard Admin** muncul. Pengguna biasa tidak bisa menaikkan `role` karena Firestore Rules melarang perubahan client, dan Netlify Function memeriksa role dari Firestore.
7. Dashboard admin dapat melihat pengguna, status akun, produk, pesanan, laporan, dan tab aktivitas login/transaksi/upload. Login Google **tidak** memverifikasi status mahasiswa aktif, meskipun domain kampus dibatasi.

## 9. Pengujian dua akun dari awal sampai akhir

Gunakan Chrome biasa untuk **owner/admin**, jendela Incognito untuk **akun mahasiswa kedua**, agar sesi tidak tercampur.

1. **Login mahasiswa A:** pilih Google. Di Firebase Authentication harus muncul UID dan email. Di Firestore harus muncul `users/{uid}` dan `privateUsers/{uid}`.
2. **Isi profil mahasiswa A:** masukkan nama, WA `08...`, fakultas dan NIM, klik Simpan. Periksa `privateUsers/{uid}` di Firestore.
3. **Upload produk A:** klik **Jual Barang**, pilih JPG/PNG/WebP di bawah 5 MB, isi nama, harga (≥ Rp1.000), kategori, kondisi, COD, WA dan deskripsi; klik **Simpan & Tayangkan**. Cek foto di Cloudinary Media Library; cek dokumen baru pada Firestore `products`; foto muncul di katalog Tukuin.
4. **Login mahasiswa B** di Incognito menggunakan akun Google berbeda. Katalog menampilkan foto A. B buka detail produk lalu ajukan pesanan. Status berubah `AVAILABLE` → `RESERVED`.
5. Cek **Pesanan & Lapak Saya** dari kedua akun; chat harus bisa dibaca kedua pihak. Masing-masing klik **Fix Deal**, kemudian penjual bisa menyelesaikan transaksi, produk berubah `SOLD`.
6. **Login owner** → Dashboard Admin → Pengguna, Produk, Transaksi, Laporan dan Aktivitas. Cek semua data.
7. Klik **Aktivitas > Sinkronkan Google Sheets** → buka Sheets → tab **Pengguna, Produk, Pesanan, Laporan, Aktivitas** harus terisi. Jadwal otomatis juga berjalan setiap 15 menit *setelah site deployed*; saat pengujian, tombol manual lebih cepat.

## 10. Cara mengetes lokal di VS Code (opsional)

**Jangan hanya** klik `Open with Live Server` untuk uji login/database—Live Server hanya menjalankan HTML dan **tidak menjalankan Netlify Functions**. Untuk uji login dengan backend dari localhost:

```powershell
npm install -g netlify-cli
netlify --version
netlify login
netlify link
netlify dev
```

Saat `netlify link`, pilih site Netlify yang benar dan pastikan environment variables sudah tersimpan di Netlify. Umumnya Netlify Dev memberi URL lokal (lihat terminal, bisa `http://localhost:8888`). Tambahkan `localhost` ke Firebase Authorized domains. Jika belum ingin menginstal Netlify CLI, **deploy ke Netlify** kemudian tes URL online langsung — ini alur paling sederhana untuk tugas.

## 11. Troubleshooting cepat

| Masalah | Pemeriksaan / solusi |
| --- | --- |
| **Deploy failed** | Netlify Deploy log → cari pesan merah pertama; periksa `package.json`, build command `npm run build`, publish `public`, Node 22; pastikan ZIP dibuka sampai root dengan `package.json`, bukan folder terbungkus ganda. |
| **Auth `unauthorized-domain`** | Firebase Authentication > Settings > Authorized domains → masukkan hostname Netlify yang **persis**. |
| **Popup Google tertutup/blocked** | Izinkan pop-up situs; gunakan Chrome normal, login ulang. |
| **Akun Gmail ditolak** | Netlify `ALLOWED_EMAIL_DOMAINS`: isi `*` untuk mengizinkan semua akun Google, lalu redeploy. Jangan pakai `*` untuk aplikasi publik kampus. |
| **Tidak ada data setelah login** | Cek Netlify Functions log dan Environment variables `FIREBASE_*` (jangan kirim secret ke chat). Pastikan Firestore database sudah dibuat & rules dipublish. |
| **`Firebase config` placeholder** | Isi nilai di `public/firebase-config.js` dari Firebase > Project Settings > Your apps; commit & push ke GitHub. |
| **`Cloudinary belum dikonfigurasi`** | Pastikan ketiga `CLOUDINARY_*` sudah ada di Netlify; deploy ulang. |
| **`Invalid Signature` dari Cloudinary** | Cek cloud name, API Key/Secret; salin ulang dari akun Cloudinary **yang sama**, redeploy. |
| **Gambar gagal upload** | Foto harus JPG/PNG/WebP dan ≤5MB; cek quota Free Cloudinary, jaringan ke `api.cloudinary.com`, dan console browser `F12`. |
| **`Missing or insufficient permissions`** | Tempel & Publish `firestore.rules` dari ZIP ke project Firebase **yang sama** dengan konfigurasi web app. |
| **Admin tidak muncul** | Ubah `users/{UID}.role` menjadi `admin` (string), pastikan akun UID sama, refresh/login ulang. |
| **Google Sheets kosong / `403`** | Enable **Google Sheets API** pada project yang sama, Share Sheet ke service-account `client_email` sebagai Editor, periksa `GOOGLE_SHEET_ID`, lalu tekan tombol sync admin. |
| **Live Server web jalan tapi tombol simpan error 404** | Wajar karena `/.netlify/functions/api` tidak ada di Live Server. Tes melalui URL Netlify atau `netlify dev`. |
| **Limit free habis** | Hentikan upload uji, kecilkan foto, kurangi frekuensi sync (hapus scheduled function), lihat penggunaan Firestore/Cloudinary/Netlify. Jangan aktifkan billing. |

## 12. Ringkasan demo untuk presentasi

- **Teknologi:** HTML + Tailwind CSS (UI asli), Firebase Auth untuk identitas, Firestore database utama, Cloudinary Media Storage untuk foto, Netlify Functions untuk API terproteksi, Google Sheets untuk monitoring owner.
- **Alur:** Pengguna login Google → server memverifikasi token dan domain → data akun dicatat → penjual mengunggah foto Cloudinary → metadata masuk Firestore → pembeli memesan dan berinteraksi → admin memantau → Google Sheets mengambil rekap.
- **Keamanan:** Validasi Firebase ID Token; hanya admin dapat moderasi; hak edit produk diperiksa server; Firestore write dari browser ditolak; Service Account dan Cloudinary Secret hanya berada di Netlify environment.
- **Batasan tugas:** transaksi hanya berupa alur pengajuan/COD dan chat sederhana, **bukan** pembayaran online, verifikasi KTM asli, atau sistem transaksi komersial yang sudah diaudit; Google Sheets sekadar rekap.

### Sumber resmi tentang layanan gratis

- <https://firebase.google.com/pricing/>
- <https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024>
- <https://cloudinary.com/pricing>
- <https://www.netlify.com/pricing/>
- <https://developers.google.com/workspace/sheets/api/limits>
