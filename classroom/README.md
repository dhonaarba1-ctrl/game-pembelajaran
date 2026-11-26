# Panduan Classroom Word dan Excel

Word dan Excel Classroom menyediakan simulasi praktik untuk siswa SMP dan SMK. Menu menggunakan istilah berbahasa Inggris dan latihan menggunakan petunjuk berbahasa Indonesia.

| Simulator | Buka di portal | Jumlah latihan |
| --- | --- | --- |
| Word Classroom | [Buka Word](https://dhonaarba1-ctrl.github.io/game-pembelajaran/Word_Classroom_Halaman_Lengkap_HP_PC.html) | 10 level, 80 misi, dan 21 misi dokumen |
| Excel Classroom | [Buka Excel](https://dhonaarba1-ctrl.github.io/game-pembelajaran/Excel_Formula_Pro_HP_PC.html) | 10 level dan 77 misi |

## Untuk siswa

1. Buka simulator. Masukkan nama, kelas, dan kode siswa. Gunakan kode yang sama setiap kali masuk. Guru memberikan satu kode unik untuk setiap siswa dalam satu kelas.
2. Pilih **Latihan**, buka level yang tersedia, dan kerjakan tugas menurut rubrik. Tekan **Periksa Jawaban**. Perbaiki kriteria yang belum terpenuhi. Setelah semua misi dalam satu level lulus, level berikutnya terbuka.
3. Pada Word, pilih **Misi Dokumen** untuk melihat contoh dokumen lengkap dan mengerjakannya di halaman terpisah. Gunakan **Mulai Dokumen Baru** untuk mengosongkan pekerjaan pada dokumen itu. Nilai terbaik disimpan.
4. Pada Excel, ketuk sel dan gunakan **Edit** atau formula bar. Untuk memilih banyak sel di HP, tekan **Range** dan masukkan alamat seperti `A1:D6`. **Formula Library** menyediakan contoh rumus, dan **Formula Lab** menyediakan worksheet percobaan.
5. Gunakan **File → Print** untuk mengatur dan mensimulasikan pencetakan. **File → Save** menyediakan latihan alur simpan. Riwayat latihan dan pekerjaan yang sedang dikerjakan disimpan pada perangkat dan profil browser yang sama.
6. Sebelum menyerahkan perangkat ke siswa lain, tekan nama siswa di bagian atas dan masukkan identitas siswa berikutnya.

Untuk kelas tanpa internet, unduh kedua berkas HTML sebelum berangkat. Buka berkas melalui browser yang menjalankan HTML lokal. Tiap berkas sudah berisi kode, aset utama, dan mesin latihan. Browser atau pembuka berkas tertentu menyediakan pratinjau HTML tanpa menjalankan skrip. Coba membuka satu berkas latihan di perangkat sekolah sebelum dibagikan. Progres versi unduhan dan versi portal memakai penyimpanan browser yang terpisah. Mode penyamaran dan penghapusan data situs dapat menghapus progres dari perangkat.

## Untuk guru

### Menyiapkan Google Sheets

1. Buat spreadsheet di akun sekolah. Pilih **Extensions → Apps Script**. Salin isi [Google_Sheets_Monitoring.gs](Google_Sheets_Monitoring.gs) ke proyek yang terikat ke spreadsheet tersebut.
2. Simpan proyek, pilih fungsi `initializeClassroomMonitoring`, jalankan sekali, dan berikan izin untuk spreadsheet itu. Akan dibuat lembar **Aktivitas Classroom** dan **Dashboard Classroom**.
3. Pilih **Deploy → New deployment → Web app**. Jalankan sebagai pemilik skrip dan pilih akses anonim **Anyone** jika tersedia dan diizinkan sekolah. Salin alamat HTTPS yang diakhiri `/exec`. [Dokumentasi Google](https://developers.google.com/apps-script/guides/web)
4. Masukkan URL di **Guru** pada Word dan **Pantauan** pada Excel. Pakai **Unduh HTML untuk Siswa** pada kedua aplikasi untuk memasukkan alamat itu ke versi yang akan dibagikan. Pengaturan di halaman portal berlaku pada browser tempat alamat dimasukkan.
5. Uji dengan satu identitas latihan. Setelah mencoba pengiriman, pastikan baris muncul di **Aktivitas Classroom** dan antrean kembali kosong. Buka **Dashboard Classroom** lalu pilih kelas di B1. Menu **Classroom → Perbarui dashboard** menghitung ulang langsung. Pemicu terjadwal memperbaruinya setiap lima menit.
6. Uji sekali dalam mode offline. Periksa latihan, sambungkan internet kembali, dan lihat apakah kiriman yang tertunda masuk sekali. Jika kiriman tetap menunggu, periksa akses anonim, status deployment, kuota Apps Script, dan apakah respons JSON penerima bisa dibaca dari browser siswa. [Kuota Apps Script](https://developers.google.com/apps-script/guides/services/quotas)

Dashboard merangkum siswa per kelas dan kode. Siswa disebut aktif jika laporan aktivitas terakhirnya maksimal tujuh hari. Kelulusan simulator berarti seluruh 10 level telah selesai. Riwayat terperinci tersedia di lembar aktivitas. Dashboard menampilkan 100 aktivitas terbaru sesuai filter.

Spreadsheet guru semestinya tetap privat. Layanan web anonim menerima kiriman simulasi dan tidak membaca balik daftar siswa. Nama, kelas, kode, aktivitas, waktu, dan ringkasan tugas masuk ke laporan. Isi dokumen atau worksheet tetap di browser. URL layanan bisa dilihat di berkas siswa. Identitas diketik sendiri sehingga laporan dapat dipalsukan oleh orang yang mengetahui URL. Gunakan laporan untuk latihan kelas. Google Workspace dapat membatasi deployment anonim. Pengaturan yang membutuhkan login Google siswa memerlukan integrasi autentikasi terpisah.

## Untuk pengembang

Kedua HTML berisi bagian terpisah untuk ribbon, editor atau grid, pengelolaan halaman, pencetakan, latihan, penyimpanan, dan pemantauan. Kode antrean bersama ada di `sync.js` dan disalin ke kedua HTML supaya masing-masing dapat dijalankan offline.

```sh
node classroom/embed-sync.cjs
npm install --no-save playwright
npx playwright install chromium
node classroom/test-classroom.cjs
```

Jalankan dari direktori utama repository. Atur `CHROMIUM_PATH` untuk memakai Chromium yang sudah tersedia. `CLASSROOM_SCREENSHOTS` dan `CLASSROOM_REPORT` opsional untuk menyimpan tangkapan layar dan hasil JSON.

[Laporan audit dan pengujian](Hasil_Pengujian.md)
