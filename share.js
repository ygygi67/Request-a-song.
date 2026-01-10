const localtunnel = require('localtunnel');
const { spawn } = require('child_process');
const fetch = require('node-fetch');

// ANSI Colors
const white = '\x1b[97m';
const reset = '\x1b[0m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const cyan = '\x1b[36m';

console.clear();
console.log(`${white}🚀 กำลังเริ่มระบบ Song Request Online...${reset}`);

// 1. Start key Server
const server = spawn('node', ['index.js'], { stdio: 'inherit' });

// 2. Wait for server to start then tunnel
setTimeout(async () => {
    try {
        console.log(`\n${white}🌐 กำลังสร้างอุโมงค์เชื่อมต่อ (Tunneling)...${reset}`);

        // Fetch Public IP
        let publicIp = 'ไม่สามารถดึง IP ได้';
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            publicIp = data.ip;
        } catch (e) {
            console.error('Failed to get public ip:', e.message);
        }

        const tunnel = await localtunnel({ port: 3000 });

        console.log(`\n${white}═══════════════════════════════════════════════════════`);
        console.log(`✅ ${green}ออนไลน์สำเร็จ! (Online Mode)${white}`);
        console.log(`═══════════════════════════════════════════════════════`);
        console.log(`\n🔗 ${cyan}ลิงก์สำหรับส่งให้เพื่อน:${white}`);
        console.log(`   🏠 หน้าขอเพลง: ${green}${tunnel.url}${white}`);
        console.log(`   📺 หน้าเครื่องเล่น: ${green}${tunnel.url}/player.html${white}`);
        console.log(`   ⚙️ หน้าแอดมิน:   ${green}${tunnel.url}/admin.html${white}`);

        console.log(`\n🔑 ${yellow}วิธีเข้าใช้งานครั้งแรก:${white}`);
        console.log(`   1. กดเข้าลิงก์ด้านบน`);
        console.log(`   2. จะเจอหน้าสีขาว ให้เอาเลข IP ด้านล่างไปกรอก`);
        console.log(`   👉 เลข IP: ${green}${publicIp}${white}`);

        console.log(`\n📋 ${cyan}ข้อความสำหรับส่งให้เพื่อน (ก๊อปปี้ได้เลย):${white}`);
        console.log(`   -------------------------------------------`);
        console.log(`   ระบบขอเพลงออนไลน์เปิดแล้ว!`);
        console.log(`   ลิงก์: ${tunnel.url}`);
        console.log(`   รหัสเข้า (IP): ${publicIp}`);
        console.log(`   -------------------------------------------`);

        console.log(`\n${yellow}* หมายเหตุ: ลิงก์และรหัสจะเปลี่ยนทุกครั้งที่เริ่มโปรแกรมใหม่${white}`);
        console.log(`═══════════════════════════════════════════════════════${reset}`);

        tunnel.on('close', () => {
            console.log('Tunnel Closed');
        });
    } catch (error) {
        console.error('Tunnel Error:', error);
    }
}, 3000); // Wait 3s for server to init

// Handle exit
process.on('SIGINT', () => {
    server.kill();
    process.exit();
});
