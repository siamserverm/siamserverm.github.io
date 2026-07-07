# SubID22 PWA Mobile Edition

ไฟล์นี้แปลงจาก HTML เป็นชุด PWA สำหรับเปิดเหมือนแอปบนมือถือ

## วิธีใช้แบบง่าย
1. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น GitHub Pages / Netlify / Vercel / โฮสต์ HTTPS
2. เปิดลิงก์ด้วย Chrome Android หรือ Safari iPhone
3. Android: กดเมนู ⋮ > Add to Home screen / ติดตั้งแอป
4. iPhone: กด Share > Add to Home Screen

## ไฟล์ที่เพิ่ม
- index.html = โปรแกรมหลักที่ใส่ PWA meta + service worker registration
- manifest.json = ข้อมูลแอปมือถือ
- service-worker.js = cache ให้เปิดเหมือนแอปและช่วยโหลดเร็วขึ้น
- icons/ = ไอคอนแอป

หมายเหตุ: PWA ต้องรันผ่าน HTTPS หรือ localhost เท่านั้น ถ้าเปิด index.html ตรง ๆ จากไฟล์ในเครื่อง ระบบติดตั้งแอปอาจไม่ขึ้น
