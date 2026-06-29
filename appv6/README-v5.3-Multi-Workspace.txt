Affiliate Landing Manager v5.3 Multi User + Multi Workspace

สิ่งที่เพิ่มจาก v5.2
- เพิ่มระบบผู้ใช้แบบ User Name / User ID
- เพิ่มระบบ Workspace ID / Workspace Name
- แยก Landing Page ในเครื่องตาม Workspace
- แยกสถิติ Firebase ตาม Workspace
- ผู้ใช้หลายคนใช้ Workspace ID เดียวกันเพื่อดูสถิติชุดเดียวกันได้
- Export Excel ใส่ชื่อ Workspace และผู้ส่งออก
- Landing Page ที่ Export/Publish จะฝัง Workspace ID ลงไป ทำให้คลิกไม่ปนงานอื่น

วิธีใช้เร็ว ๆ
1. เปิด index.html
2. ไปที่ ตั้งค่า
3. กรอกชื่อผู้ใช้
4. กรอก Workspace ID เช่น job-shopee-001
5. กด บันทึก / สลับ Workspace
6. เพิ่ม Landing Page แล้ว Export/Publish ใหม่
7. ดูสถิติในหน้า สถิติคลิก

สำคัญ
- ถ้าเปลี่ยน Workspace แล้ว ต้อง Export/Publish Landing Page ใหม่ เพื่อให้หน้าเว็บส่งคลิกเข้า Workspace ที่ถูกต้อง
- Workspace ID เดียวกัน = ใช้สถิติร่วมกัน
- Workspace ID คนละตัว = งานแยกกัน ไม่ปนกัน
- เวอร์ชันนี้ยังไม่ใช่ Firebase Authentication เต็มรูปแบบ แต่รองรับการแยกผู้ใช้/แยกงานแบบใช้งานง่ายผ่าน Workspace ID
