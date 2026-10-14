# Araç Sefer ve Dağıtım Tablosu

Minimalist ve modern tasarıma sahip, gerçek zamanlı Firebase Firestore entegrasyonlu araç sefer ve lojistik takip tablosu.

## Özellikler

- **Minimalist & Modern Arayüz:** Keskin ve sade görünüm için tüm bileşenlerde 2px ve 4px köşe yuvarlaklığı (`border-radius`).
- **Girişsiz Doğrudan Kullanım:** Herhangi bir hesap girişi gerektirmeden, siteyi açan herkes anında seferleri görebilir, yeni tarih ekleyebilir veya hücreleri düzenleyebilir.
- **Sadece Sütun Ekleme & Çıkarma:** Tablo bütünlüğünü korumak adına sadece tarih sütunu eklenebilir. Sütun silme desteği mevcuttur.
- **3 Tarih Sütunu Limiti & Onay Ekranı:** Tabloda aynı anda en fazla 3 tarih sütunu bulunur. 4. tarih eklendiğinde kullanıcıya en eski tarihin silineceğine dair onay ekranı sunulur; onaylanırsa en eski tarih temizlenip yeni tarih eklenir.
- **Renk Kodlu Sefer Takibi:**
  - 🌸 **Pembe:** Sabah Seferleri
  - ☀️ **Sarı:** Akşam Seferleri
  - 🌙 **Açık Mavi:** Gece / Havalimanı Seferleri
  - ⬛ **Koyu Gri:** Raporlu / Arızalı
  - ⬛ **Siyah:** Sefer Dışı / Bloke
- **Dinamik Sefer Sayacı:** Her tarih sütunu için aktif sefer sayısı `(Toplam : X)` dinamik olarak hesaplanır.
- **Mobil Uyumlu (Responsive):** Plaka ve sürücü sütunları sabit (sticky) olup, mobil ekranlarda hızlı tarih geçiş çipleri yer alır.
- **Firebase Firestore Entegrasyonu:** Gerçek zamanlı senkronizasyon ve çevrimdışı önbellek (offline fallback) desteği.

## Kurulum ve Yerel Çalıştırma

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın
npm run dev

# Canlı dağıtım için derleyin
npm run build
```

## GitHub Pages Yayınlama

Projeye entegre edilen GitHub Actions iş akışı sayesinde, bu depoda GitHub Pages ayarlarından (`Settings` > `Pages` > `Source: GitHub Actions`) seçildiğinde site otomatik olarak yayına alınır.
