# 🎵 Song Request System (ระบบขอเพลงออนไลน์)

ระบบขอเพลง YouTube แบบ Real-time เหมาะสำหรับร้านอาหาร, งานปาร์ตี้, หรือห้องนั่งเล่น
ให้เพื่อนๆ ช่วยกันขอเพลงได้ง่ายๆ ผ่านมือถือ พร้อมหน้าจอ Player ที่สวยงามและ Admin Dashboard สุดเทพ!

[!Project Preview](https://cdn.discordapp.com/attachments/1300061288621277296/1459553259755671775/image.png?ex=6963b266&is=696260e6&hm=ebe36f7712bbfd44fb0012e82ad7340ea6277faa67fa0882df66379f317f645a&)

## ✨ ฟีเจอร์เด่น (Features)

### 📱 ฝั่งคนขอเพลง (User)
- **Search & Request**: ค้นหาเพลงจาก YouTube หรือแปะลิงก์ได้เลย
- **Duplicate Check**: ระบบป้องกันเพลงซ้ำ (เช็คย้อนกลับเฉพาะของวันนั้นๆ)
- **Playback History**: ดูรายการเพลงที่เพิ่งเล่นจบไปได้ที่หน้าแรก
- **Queue Status**: เช็คคิวเพลงถัดไปและเวลาที่ต้องรอได้

### 📺 ฝั่งเครื่องเล่น (Player)
- **Cinema Mode**: โหมดโรงหนัง! สั่งขยายจอให้เต็มอัตโนมัติจาก Admin
- **Daily Counter**: แสดงลำดับเพลงของวันนี้ (เช่น เพลงที่ 10 ของวันนี้)
- **Seamless Playback**: เล่นเพลงต่อเนื่อง ไม่มีโฆษณาคั่น (ใช้ YouTube IFrame API)
- **Smart Frame**: ปรับขนาดวิดีโอ/ปกเพลงให้อัตโนมัติ พร้อมพื้นหลังเบลอ (Contain + Blur)

### 🛠️ ฝั่งแอดมิน (Admin Dashboard)
- **Full Control**: สั่งเล่น, หยุด, ข้าม, ย้อนกลับ, วนซ้ำ ได้ดั่งใจ
- **Daily Statistics**: ดูสถิติจำนวนเพลงที่เล่นในแต่ละวัน
- **Remote Cinema Trigger**: ปุ่มสั่งขยายจอ Player "🖵" (ไม่ต้องเดินไปกดเอง!)
- **Remote Volume**: ปรับเสียง Player ได้จากหน้าแอดมิน (0-100%) 🔊
- **Tunnel Password Guide**: แสดงรหัสผ่าน Tunnel (IP) ให้แอดมินส่งต่อได้ทันที

---

## 🚀 การติดตั้งและใช้งาน (Installation)

### สิ่งที่ต้องมี
- [Node.js](https://nodejs.org/) (เวอร์ชั่น 14 ขึ้นไป)

### 1. ติดตั้ง (Setup)
Clone โปรเจกต์
```bash
git clone https://github.com/ygygi67/Request-a-song.
cd Request-a-song.
```
เข้าไปที่โฟลเดอร์ server และติดตั้งแพ็คเกจ
```bash
cd server
npm install
```

### 2. เริ่มต้นใช้งาน (Run locally)
รันเซิร์ฟเวอร์ (ในโฟลเดอร์ server)
```bash
npm start
```
- **หน้าขอเพลง**: `http://localhost:3000`
- **หน้าแอดมิน**: `http://localhost:3000/admin.html`
- **หน้าเครื่องเล่น**: `http://localhost:3000/player.html`

### 3. แบ่งปันให้เพื่อนเข้า (Online Share)
ถ้าอยากให้เพื่อนที่อยู่คนละบ้านเข้ามาขอเพลงได้:

#### วิธีที่ 1: ใช้ Cloudflare Tunnel (แนะนำ)
รันคำสั่งนี้แทน npm start
```bash
npm run share
```
หรือรันแบบแยก:
```bash
node server.js &
cloudflared tunnel --url http://localhost:3000
```
รอสักพัก... ระบบจะสร้าง **URL สาธารณะ** ให้ (เช่น `https://cool-music.loca.lt`) ก๊อปส่งให้เพื่อนได้เลย!

#### วิธีที่ 2: ใช้ Ngrok
```bash
# ติดตั้ง ngrok (ครั้งแรกเท่านั้น)
npm install -g ngrok

# รัน server และสร้าง tunnel
node server.js &
ngrok http 3000
```
ระบบจะแสดง URL สาธารณะ (เช่น `https://abc123.ngrok.io`) ให้คัดลอกส่งเพื่อน

#### วิธีที่ 3: ใช้ TryCloudflare
```bash
# ติดตั้ง trycloudflare (ครั้งแรกเท่านั้น)
npm install -g trycloudflare

# รัน server และสร้าง tunnel
node server.js &
trycloudflare tunnel --url http://localhost:3000
```
ระบบจะสร้าง URL สาธารณะให้ใช้งานได้ทันที

> 💡 **เคล็ดลับ**: Cloudflare Tunnel และ TryCloudflare มักจะเสถียรกว่า Ngrok และไม่ต้องสมัครสมาชิกก่อน!

---

## 📱 การใช้งานบนมือถือ (Termux Android)

อยากรัน Server บนมือถือ Android? ทำได้ง่ายๆ!
1. โหลดแอป **Termux**
2. พิมพ์คำสั่งติดตั้ง:
   ```bash
   pkg update && pkg upgrade
   pkg install nodejs git
   termux-setup-storage
   ```
3. ย้ายไฟล์โปรเจกต์ลงมือถือ
4. เข้าไปที่โฟลเดอร์แล้วรัน `npm install` และ `npm start` เหมือนในคอม!

---

## 📂 โครงสร้างโปรเจกต์
```
song-request-system/
├── public/              # หน้าเว็บ (Frontend)
│   ├── index.html       # หน้าขอเพลง
│   ├── admin.html       # หน้าแอดมิน
│   ├── player.html      # หน้าจอเล่นเพลง
│   ├── css/             # สไตล์ตกแต่ง
│   └── js/              # โค้ด JavaScript ฝั่งหน้าเว็บ
└── server/              # หลังบ้าน (Backend)
    ├── index.js         # เซิร์ฟเวอร์หลัก (Express)
    ├── services/        # ฟังก์ชั่นเสริม (YouTube API, etc.)
    └── share.js         # สคริปต์สำหรับแชร์ออนไลน์
```

---

Made with ❤️ by [ygygi67] & Antigravity AI





