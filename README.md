# CRM — Telefon Nömrələri İdarəetmə Sistemi

## Haqqında
Azərbaycan dilli, tam static CRM sistemi. Supabase backend, HTML/CSS/JS frontend.

## Xüsusiyyətlər
- 🔐 Admin / İşçi rol sistemi (Supabase Auth + RLS)
- 📱 Telefon nömrəsi idarəetməsi (Azərbaycan formatı)
- 📤 CSV/TXT import (təkrar nömrə aşkarlaması ilə)
- 🎲 Random nömrə paylaşdırması
- 💬 WhatsApp inteqrasiyası
- 📊 Status sistemi (8 status)
- 📝 Qeyd sistemi
- 📅 Tarixçə
- 🔔 Növbəti əlaqə xatırlatması
- 📈 Admin statistikası
- 🔍 Filtrləmə sistemi

## Supabase Setup

1. [supabase.com](https://supabase.com) → Project → SQL Editor
2. `supabase-setup.sql` faylını kopyalayıb çalıştırın
3. Admin user yaradın:
   - Authentication → Users → Add User
   - E-poçt və şifrə daxil edin
   - Sonra SQL ilə admin rolunu verin:
   ```sql
   UPDATE public.profiles SET role = 'admin', full_name = 'Admin Ad' WHERE email = 'admin@youremail.com';
   ```

## Deploy (Render Static Site)

1. GitHub-a push edin
2. [render.com](https://render.com) → New → Static Site
3. Repository seçin
4. Build command: boş buraxın
5. Publish directory: `.` (root)
6. Deploy edin

## Texnologiyalar
- HTML5, CSS3, Vanilla JavaScript
- Supabase (Auth + PostgreSQL + RLS)
- Font Awesome 6
- Supabase JS v2 (CDN)

## Fayllar
```
index.html          — Əsas tətbiq
style.css           — Dizayn
app.js              — Bütün JavaScript məntiqi  
supabase-setup.sql  — Database schema + RLS + ilkin nömrələr
```
