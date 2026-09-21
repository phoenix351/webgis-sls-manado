# WebGIS Peta Interaktif SLS & Titik Geotag Kota Manado

Aplikasi Peta Interaktif berbasis WebGIS untuk monitoring wilayah Satuan Lingkungan Setempat (SLS) dan titik-titik hasil pendataan/geotag Sensus Ekonomi (SE) 2026 di Kota Manado.

Aplikasi ini menggabungkan **504 poligon SLS** dan **150.885 titik geotag** dengan latar belakang **Google Maps (Satelit, Hybrid, Jalan)**, **OpenStreetMap**, dan **ESRI Satellite**.

---

## Fitur Utama

1. **Pemuatan On-Demand Cepat & Ringan (Zero Lag)**
   - 150.885 titik geotag dipartisi ke dalam 504 berkas JSON per-SLS (rata-rata ukuran per berkas hanya 20–50 KB).
   - Browser ponsel hanya mengunduh titik pada SLS yang sedang dipilih, sangat hemat kuota dan responsif 60fps.

2. **Simbologi Multivariat Standar SE / QGIS**
   - **BKU (Bangunan Khusus Usaha - Kode 1)**: Biru (`#0064e6`)
   - **Campuran (Usaha & Tinggal - Kode 2)**: Ungu (`#aa1ec8`)
   - **BTT (Tempat Tinggal - Kode 3)**: Hijau (`#1eaf1e`)
   - **Fasum / Kantor (Kode 4, 5, 7, 8)**: Oranye (`#f5820a`)
   - **Kosong / Rusak (Kode 6)**: Abu-abu (`#8c8c8c`)
   - **Non Respon (Kode 9)**: Tanda Silang Merah (`#e61414`)
   - **Indikator Solid vs Cincin**:
     - *Solid (Lingkaran Penuh)*: Status Berhasil (Approved / Submitted / Ditemukan / Baru)
     - *Hollow (Cincin)*: Status Belum Selesai (Tidak dapat ditemui / Non-eligible / Rejected / Draft)

3. **GPS Lapangan Real-Time & Auto-Detect SLS**
   - Menggunakan GPS bawaan ponsel untuk menandai posisi petugas secara presisi.
   - Algoritma spasial *Point-in-Polygon* secara otomatis mendeteksi di dalam SLS mana petugas sedang berdiri, disertai notifikasi satu-klik untuk langsung memuat titik SLS tersebut.

4. **Navigasi Langsung ke Google Maps App**
   - Klik pada titik bangunan manapun untuk melihat detail (No Bangunan, Status Keberadaan, Status Pendataan, Akurasi GPS).
   - Tombol **"Buka Rute di Google Maps"** langsung membuka aplikasi Google Maps di ponsel untuk panduan jalan kaki atau berkendara menuju titik bangunan tersebut.

5. **Pencarian Cepat & Filter Bertingkat**
   - Filter hierarki administratif: `Kecamatan ➔ Kelurahan ➔ SLS`.
   - Pencarian instan berdasarkan Nama SLS, ID SLS (14-digit), atau ID Bangunan.
   - Filter toggle kategori titik dan opsi *"Hanya Belum Selesai"*.
   - Fitur Cluster toggle untuk melihat sebaran klaster atau titik tunggal.

---

## Cara Menjalankan Aplikasi Secara Lokal (Offline Ready)

### Opsi 1: Klik Ganda `run_app.bat` (Windows)
Cukup klik dua kali berkas **`run_app.bat`**. Aplikasi akan otomatis membuka browser di alamat:
```
http://localhost:8080
```

### Opsi 2: Menggunakan Terminal Python
Jalankan perintah berikut di folder proyek ini:
```bash
python server.py
```

---

## Cara Deploy ke Vercel (Online & Gratis)

Aplikasi ini berarsitektur **Serverless Static WebGIS** sehingga dapat di-deploy ke Vercel dalam hitungan detik.

### Langkah Deploy via Vercel CLI:
Jika Node.js sudah terpasang:
```bash
npx vercel
```
Ikuti petunjuk di terminal:
1. `Set up and deploy?` Ketik `y`
2. `Which scope?` Pilih akun Vercel Anda
3. `Link to existing project?` Ketik `n`
4. `What's your project's name?` Ketik `webgis-sls-manado` (atau nama pilihan Anda)
5. `In which directory is your code located?` Tekan `Enter` (`./`)
6. Tunggu proses upload selesai. Anda akan mendapatkan URL publik seperti: `https://webgis-sls-manado.vercel.app`!

### Langkah Deploy via GitHub (Paling Direkomendasikan):
1. Buat repositori baru di GitHub (misal: `webgis-sls-manado`).
2. Commit dan push folder ini ke GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit WebGIS SLS Manado"
   git branch -M main
   git remote add origin https://github.com/USERNAME/webgis-sls-manado.git
   git push -u origin main
   ```
3. Buka [https://vercel.com](https://vercel.com), klik **"Add New" ➔ "Project"**, pilih repositori `webgis-sls-manado`, dan klik **"Deploy"**.
4. Selesai! Aplikasi langsung aktif dan dapat diakses oleh seluruh petugas dan pengawas dari ponsel maupun komputer di mana saja.

---

## Pembaruan Data di Masa Depan

Jika di kemudian hari terdapat pemutakhiran data geotag di file GPKG atau perubahan poligon SLS:
1. Perbarui berkas `geotag_hasil_SE_sementara.gpkg` atau `SLS_Manado_Dissolved.geojson`.
2. Jalankan skrip pipeline:
   ```bash
   python build_data.py
   ```
   *(Data di folder `data/` akan diperbarui secara otomatis dalam waktu ~2,5 detik!)*
3. Lakukan deploy ulang atau push ke GitHub.
