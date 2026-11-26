# Audit dan hasil pengujian Classroom

Audit dimulai dari `main` pada revisi `5e370174b89467ba813eabdb29d226d7c4b48589`. SHA-256 kedua simulator di repository cocok dengan berkas di paket revisi Word–Excel tanggal 25 November. Portal menautkan keduanya langsung dari direktori utama.

## Temuan dan perbaikan

| Prioritas | Temuan awal | Perbaikan |
| --- | --- | --- |
| 1 | Penghapusan atau pengetikan pada seleksi lintas halaman mengosongkan dokumen. Pengaturan font pada bagian yang sebelumnya sudah diformat bisa meninggalkan format lama yang tetap terlihat. | Operasi lintas halaman mempertahankan isi di kedua sisi pilihan. Pemformatan bekerja pada potongan teks terpilih. Undo dan Redo bisa dipicu lewat keyboard. |
| 2 | Rentang numerik menghitung beberapa sel teks sebagai angka. Pencarian mode menurun dan terbalik keliru. EDATE dapat melewati akhir bulan. | Koreksi pada agregasi, prioritas operator, MATCH, XLOOKUP, EDATE, dan penanganan rujukan. Mesin rumus dipertahankan dan diuji pada kasus terukur. |
| 2 | Fill bisa mengubah pengenal di luar referensi sel. Cut lintas sheet bisa menghapus dari sheet yang salah. Insert atau Delete baris meninggalkan referensi usang. | Referensi dikoreksi sesuai tipe absolut, relatif dan campuran. Pemindahan memakai sheet sumber. Referensi sel dan rentang ikut bergeser ketika struktur sheet berubah. |
| 3 | Tampilan cetak Excel memakai lebar tabel yang dipaksakan dan ukuran teks yang diperkecil satu per satu. | Pratinjau menskalakan kertas, margin, lebar kolom, tinggi baris, dan tipografi sebagai satu lembar. Area gabungan di satu halaman dicetak sebagai sel gabungan. Word menambahkan A5, penggaris yang bisa disetel, pilihan shape, rotasi, dan merge/split horizontal. |
| 4 | Excel menyimpan lembar latihan tertentu saat pindah level atau memeriksa misi. Ekspor untuk guru dapat menyertakan isi worksheet aktif. | Workbook dan nilai terbaik disimpan menurut kelas serta kode. Kedua ekspor diuji membuka keadaan awal tanpa pekerjaan siswa. Kelulusan lama tetap tercatat saat siswa mencoba lagi. |
| 4 | Permintaan jaringan tanpa respons yang bisa dibaca dianggap sudah terkirim. | Antrean lokal menghapus entri setelah menerima bukti penerimaan dari server. Apps Script menggunakan ID aktivitas dan lock untuk menangani pengiriman ulang dan kiriman bersamaan. |
| 5 | Formula bar dan beberapa kontrol sempit pada HP. | Penataan formula bar, kontrol sentuh, ribbon yang bisa digulir, palet Classroom, serta pengguliran ke area aktif saat viewport berubah. |

## Regresi akhir

**Lulus 135 · Gagal 0** pada Chromium headless melalui Playwright. Kedua aplikasi dimuat dari HTML lokal dengan jaringan dinonaktifkan. Tangkapan layar diperiksa pada desktop 1366×768 dan 1920×1080, HP 390×844 dan 844×390, serta tablet 820×1180. Viewport dan input sentuh diemulasikan.

| Area | Cakupan |
| --- | --- |
| Word | Ketik di tengah kalimat, Enter, Shift+Enter, Ctrl+Enter, format beberapa font dan ukuran dalam satu paragraf, Undo/Redo, seleksi lintas halaman, halaman otomatis, kursor setelah reflow, penyisipan dan resize gambar, Wrap Text, tabel kosong, lebar kolom, pratinjau beberapa halaman, dan profil terpisah. |
| Excel | Ketik, Enter, Shift+Enter, Tab, F2, Alt+Enter, formula bar, range, copy/paste, cut antarsheet, Undo/Redo, Fill Down/Right, referensi lintas sheet, referensi absolut/campuran, perubahan struktur, hitung ulang, rumus bertingkat, pencarian, tanggal, keuangan, kesalahan plus circular reference, filter, sort, chart, pratinjau cetak, dan simpan/pulih. |
| Latihan | Jumlah 80 misi Word, 21 misi dokumen dan 77 misi Excel, level terkunci, pemisahan identitas, penyimpanan nilai, Formula Library dan Formula Lab. Isi tiap misi belum dijalankan sampai lulus satu per satu. |
| Pelaporan | Apps Script diuji dengan layanan spreadsheet tiruan untuk validasi dan deduplikasi. Browser diuji terhadap server tiruan untuk keadaan offline, kegagalan, dan bukti penerimaan. Ekspor HTML diuji bebas dari contoh data siswa dan bisa dibuka offline. |

Daftar kasus dan cara menjalankan ulang tersedia di [test-classroom.cjs](test-classroom.cjs) dan [panduan pengembang](README.md#untuk-pengembang).

## Perbaikan Word untuk layar HP

Undo dan Redo sebelumnya disembunyikan oleh aturan tampilan saat layar selebar 520 px atau kurang. Keduanya sekarang dipasang di sisi kiri bilah atas, dengan label teks dan status aktif sesuai riwayat dokumen.

Enter membuat paragraf pada halaman tempat kursor berada. Pengujian mencakup sampul dengan pemisah halaman, sebuah paragraf dengan kursor di tengah, Shift+Enter, Ctrl+Enter, serta pemindahan otomatis ketika kertas penuh. Uji sentuh juga memeriksa Undo dan Redo dan navigasi grup Home.

Home menyediakan pintasan ke Clipboard, Font, Paragraph, Styles, dan Editing. Di dalamnya tersedia atur besar huruf, Change Case, Multilevel List, tanda paragraf, jarak baris, batas dan warna paragraf, serta gaya Title dan Subtitle.

## Pembandingan tab Home dengan Word untuk Windows

| Grup | Alur Word untuk Windows yang dijadikan acuan | Penambahan di Classroom |
| --- | --- | --- |
| Clipboard | Opsi mempertahankan format, menggabungkan format, dan teks saja. Clipboard Office menyimpan beberapa salinan lintas aplikasi. | Paste Special dengan tiga mode teks, dan riwayat sampai 24 salinan selama sesi Classroom. |
| Font | Dialog Font, spasi karakter lanjutan, Change Case, dan efek teks. | Dialog dengan gaya, warna, garis bawah, small caps, spasi dan posisi karakter, serta pilihan bayangan, cahaya, dan outline. Change Case mencakup Sentence case. |
| Paragraph | Galeri bullet dan penomoran, indentasi, spasi, serta Sort. | Bullet standar atau simbol khusus, tipe dan angka awal penomoran, hanging indent, tab leader, serta Sort teks/angka pada paragraf berurutan, daftar satu tingkat, dan tabel. |
| Styles | Galeri, buat gaya dari format contoh, dan ubah gaya dokumen. | Gaya buatan bisa disimpan per dokumen, diterapkan ulang, dan diperbarui pada paragraf yang memakainya. |
| Editing | Find, Replace, Go To, serta Select dan Selection Pane. | Find Next, Replace dan Replace All dengan opsi kapitalisasi dan kata utuh, Go To untuk halaman dan objek tertentu, serta panel untuk memilih gambar, bentuk, dan tabel. |

Tes tambahan mencakup penempelan berformat dan teks saja, Font Settings dan undo efek teks, pengurutan, penomoran, bullet, indentasi gantung, ubah gaya, pencarian yang melintasi format inline, serta navigasi ke halaman dan objek.

Clipboard Classroom bekerja di dalam simulator. Pemilihan objek di Selection Pane dilakukan satu per satu. Varian perintah Word yang bergantung pada akun, perangkat, dan layanan Microsoft 365 seperti Dictate serta pemeriksaan tata bahasa Microsoft Editor memerlukan layanan Microsoft. Dukungan dasar spellcheck pada simulator tetap mengikuti browser.

Rujukan Microsoft untuk Home tersedia pada [Pintasan Word](https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word), [Opsi Paste](https://support.microsoft.com/id-id/word/control-the-formatting-when-you-paste-text), [Office Clipboard](https://support.microsoft.com/id-id/word/copy-and-paste-using-the-office-clipboard), [Spasi karakter](https://support.microsoft.com/id-id/word/change-the-spaces-between-text-in-word), [Format daftar](https://support.microsoft.com/id-id/word/define-new-bullets-numbers-and-multilevel-lists), [Sort](https://support.microsoft.com/en-us/word/sort-a-list-alphabetically-in-word), [Styles](https://support.microsoft.com/en-us/word/customize-or-create-new-styles), dan [Select Objects](https://support.microsoft.com/en-us/word/select-a-shape-or-other-object-in-word).

## Batasan yang masih berlaku

- Word memakai editor HTML dan membagi konten berdasarkan ukuran tampilan. Dokumen dengan tabel rumit, objek yang lebih besar dari area cetak, dan alur kolom yang kompleks dapat berbeda dari Word desktop. Merge dan Split mencakup sel yang berdampingan secara horizontal. Track Changes dapat menerima atau memulihkan perubahan sebagai satu kelompok. Sebagian perintah Draw, References, Mailings, dan Review masih berupa demonstrasi. Section Break menyediakan penanda dan pemisah halaman, dengan pengaturan kertas di tingkat dokumen.
- Mesin Excel adalah parser lokal dengan 161 nama fungsi yang tersedia, termasuk alias. Uji regresi mengambil kasus representatif dari fungsi utama. Worksheet berukuran tetap 150 × 32. Formula yang mengembalikan array belum menyediakan penumpahan hasil lengkap. Lookup tertentu mengandalkan urutan yang benar pada mode pencarian biner. Fungsi dengan argumen opsional atau format khusus dapat menghasilkan perbedaan dari Excel desktop. Berkas, grafik, PivotTable, dan cetak memakai fitur pembelajaran yang disederhanakan.
- Font memakai font perangkat atau font pengganti. Pengujian keyboard layar pada Android fisik, browser di luar Chromium, dan deployment Apps Script milik sekolah masih perlu dilakukan. Mode offline diuji dengan HTML lokal. Progres disimpan per salinan dan per profil browser sesuai aturan penyimpanan perangkat.
- Dashboard dan penerima laporan perlu dipasang pada spreadsheet guru. Pengujian tiruan tidak memverifikasi kuota, izin domain sekolah, atau kebijakan respons lintas origin pada deployment Google yang sebenarnya.

Rujukan teknis tersedia di [Chrome for Developers](https://developer.chrome.com/docs/modern-web-guidance), [Microsoft Support untuk urutan operator Excel](https://support.microsoft.com/en-us/excel/the-order-in-which-excel-performs-operations-in-formulas), dan [dokumentasi Web Apps Google](https://developers.google.com/apps-script/guides/web).
