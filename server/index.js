const express = require('express');
const cors = require('cors');
const path = require('path');
const NodeCache = require('node-cache');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Generate random admin password on each startup
const ADMIN_PASSWORD = crypto.randomBytes(4).toString('hex'); // 8 character hex string

// Cache for storing data (in-memory storage)
const cache = new NodeCache({ stdTTL: 0 });

// Initialize default data
if (!cache.has('songs')) {
    cache.set('songs', []);
}
if (!cache.has('names')) {
    cache.set('names', []);
}
if (!cache.has('currentSong')) {
    cache.set('currentSong', null);
}
if (!cache.has('playbackState')) {
    cache.set('playbackState', { isPlaying: false, currentTime: 0, startedAt: null, isRepeat: false, cinemaMode: false, volume: 100 });
}
if (!cache.has('history')) {
    cache.set('history', {}); // Grouped by date: { '2026-01-10': [song1, song2] }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Import services
const { validateYouTubeLink, validateMusicLink, getVideoInfo, searchYouTube, resolveToVideo } = require('./services/youtube');
const { checkProfanity } = require('./services/profanity');

// ==================== API Routes ====================

// Get all songs in queue
app.get('/api/songs', (req, res) => {
    const songs = cache.get('songs') || [];
    const currentSong = cache.get('currentSong');
    const playbackState = cache.get('playbackState');

    // Calculate estimated play time for each song
    let totalDuration = 0;
    if (currentSong && playbackState.isPlaying && playbackState.startedAt) {
        const elapsed = (Date.now() - playbackState.startedAt) / 1000;
        totalDuration = Math.max(0, (currentSong.duration || 180) - elapsed);
    }

    const songsWithEstimate = songs.map((song, index) => {
        const estimatedPlayTime = new Date(Date.now() + totalDuration * 1000);
        const result = {
            ...song,
            queueNumber: index + 1,
            estimatedWaitSeconds: Math.floor(totalDuration),
            estimatedWaitMinutes: Math.ceil(totalDuration / 60),
            estimatedPlayTime: estimatedPlayTime.toISOString()
        };
        totalDuration += song.duration || 180;
        return result;
    });

    res.json(songsWithEstimate);
});

// Get current playing song
app.get('/api/songs/current', (req, res) => {
    const currentSong = cache.get('currentSong');
    const playbackState = cache.get('playbackState');
    const songs = cache.get('songs') || [];

    let currentTime = 0;
    if (currentSong && playbackState.isPlaying && playbackState.startedAt) {
        currentTime = (Date.now() - playbackState.startedAt) / 1000;
    }

    res.json({
        current: currentSong,
        isPlaying: playbackState.isPlaying,
        isRepeat: playbackState.isRepeat || false,
        currentTime: currentTime,
        nextSong: songs[0] || null,
        playbackState: playbackState // Include full state (cinemaMode)
    });
});

// Submit new song request
app.post('/api/songs', async (req, res) => {
    try {
        const { name, songName, link } = req.body;

        // Validate song name is required
        if (!songName || !songName.trim()) {
            return res.status(400).json({ error: 'กรุณาใส่ชื่อเพลง' });
        }

        // Check profanity in name
        if (name && checkProfanity(name)) {
            return res.status(400).json({ error: 'ชื่อมีคำไม่สุภาพ กรุณาใช้ชื่ออื่น' });
        }

        // Validate link if provided
        let videoInfo = null;
        if (link && link.trim()) {
            const linkValidation = validateMusicLink(link);
            if (!linkValidation.valid) {
                return res.status(400).json({ error: 'ลิงค์ไม่ถูกต้อง รองรับ: YouTube, Spotify, SoundCloud, Apple Music' });
            }
            videoInfo = await getVideoInfo(link);
            if (!videoInfo) {
                return res.status(400).json({ error: 'ไม่สามารถดึงข้อมูลเพลงจากลิงค์ได้' });
            }
        }

        // Check for duplicate song (only current queue and today's history)
        const songs = cache.get('songs') || [];
        const history = cache.get('history') || {};
        const todayAt = new Date().toISOString().split('T')[0];
        const todayHistory = history[todayAt] || [];

        const isDuplicateInQueue = songs.some(s =>
            s.songName.toLowerCase() === songName.toLowerCase() ||
            (link && s.link === link)
        );

        const isDuplicateInHistory = todayHistory.some(s =>
            s.songName.toLowerCase() === songName.toLowerCase() ||
            (link && s.link === link)
        );

        const isDuplicate = isDuplicateInQueue || isDuplicateInHistory;

        if (isDuplicate && !req.body.confirmDuplicate) {
            return res.status(409).json({
                error: 'เพลงนี้เคยถูกขอไปแล้วในวันนี้',
                isDuplicate: true
            });
        }

        // Create new song entry
        const newSong = {
            id: Date.now().toString(),
            name: name?.trim() || 'ไม่ระบุชื่อ',
            songName: songName.trim(),
            link: link?.trim() || '',
            submittedAt: new Date().toISOString(),
            votes: { up: 0, down: 0 },
            status: 'pending',
            videoInfo: videoInfo,
            duration: videoInfo?.duration || 180, // default 3 minutes
            isDuplicate: isDuplicate
        };

        songs.push(newSong);
        cache.set('songs', songs);

        // Save name to history
        if (name && name.trim()) {
            const names = cache.get('names') || [];
            if (!names.includes(name.trim())) {
                names.push(name.trim());
                cache.set('names', names);
            }
        }

        res.status(201).json(newSong);
    } catch (error) {
        console.error('Error submitting song:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
    }
});

// Vote on a song
app.post('/api/songs/:id/vote', (req, res) => {
    const { id } = req.params;
    const { type } = req.body; // 'up' or 'down'
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!['up', 'down'].includes(type)) {
        return res.status(400).json({ error: 'Invalid vote type' });
    }

    const songs = cache.get('songs') || [];
    const songIndex = songs.findIndex(s => s.id === id);

    if (songIndex === -1) {
        return res.status(404).json({ error: 'Song not found' });
    }

    // Basic server-side double vote check (IP based)
    const voteCacheKey = `vote_${id}_${ip}`;
    if (cache.get(voteCacheKey)) {
        return res.status(400).json({ error: 'คุณโหวตเพลงนี้ไปแล้ว' });
    }

    songs[songIndex].votes[type]++;
    cache.set(voteCacheKey, true, 3600); // Record vote for 1 hour
    cache.set('songs', songs);

    res.json(songs[songIndex]);
});

// Update song link (admin)
app.put('/api/songs/:id/link', async (req, res) => {
    const { id } = req.params;
    const { adminKey, link } = req.body;

    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const songs = cache.get('songs') || [];
    const songIndex = songs.findIndex(s => s.id === id);

    if (songIndex === -1) {
        return res.status(404).json({ error: 'Song not found' });
    }

    try {
        const videoInfo = await getVideoInfo(link);
        if (!videoInfo) {
            return res.status(400).json({ error: 'ลิงก์ไม่ถูกต้อง หรือไม่สามารถดึงข้อมูลได้' });
        }

        songs[songIndex].link = link;
        songs[songIndex].videoInfo = videoInfo;
        songs[songIndex].duration = videoInfo.duration || 180;
        cache.set('songs', songs);

        res.json({ message: 'Link updated', song: songs[songIndex] });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete song (admin)
app.delete('/api/songs/:id', (req, res) => {
    const { id } = req.params;
    const { adminKey } = req.body;

    // Simple admin authentication
    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let songs = cache.get('songs') || [];
    const songIndex = songs.findIndex(s => s.id === id);

    if (songIndex === -1) {
        return res.status(404).json({ error: 'Song not found' });
    }

    songs[songIndex].status = 'rejected';
    const rejectedSong = songs[songIndex];
    songs.splice(songIndex, 1);
    cache.set('songs', songs);

    res.json({ message: 'Song rejected', song: rejectedSong });
});

// Prioritize song (admin) - move to top of queue
app.post('/api/songs/:id/priority', (req, res) => {
    const { id } = req.params;
    const { adminKey } = req.body;

    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let songs = cache.get('songs') || [];
    const songIndex = songs.findIndex(s => s.id === id);

    if (songIndex === -1) {
        return res.status(404).json({ error: 'Song not found' });
    }

    const targetSong = songs[songIndex];
    // Remove from current position
    songs.splice(songIndex, 1);
    // Insert at front
    songs.unshift(targetSong);

    cache.set('songs', songs);
    res.json({ message: 'Song prioritized', song: targetSong });
});

// Skip current song (admin)
app.post('/api/songs/skip', (req, res) => {
    const { adminKey } = req.body;

    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const songs = cache.get('songs') || [];
    const currentSong = cache.get('currentSong');

    // Move to next song
    if (songs.length > 0) {
        const nextSong = songs.shift();
        cache.set('songs', songs);
        cache.set('currentSong', nextSong);
        cache.set('playbackState', { isPlaying: true, currentTime: 0, startedAt: Date.now() });
        res.json({ message: 'Skipped to next song', current: nextSong });
    } else {
        cache.set('currentSong', null);
        cache.set('playbackState', { isPlaying: false, currentTime: 0, startedAt: null });
        res.json({ message: 'No more songs in queue', current: null });
    }
});

// Play/Pause control (admin)
app.post('/api/playback', (req, res) => {
    const { adminKey, action } = req.body;

    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const playbackState = cache.get('playbackState');
    const currentSong = cache.get('currentSong');
    const songs = cache.get('songs') || [];

    if (action === 'play') {
        if (!currentSong && songs.length > 0) {
            const nextSong = songs.shift();
            cache.set('songs', songs);
            cache.set('currentSong', nextSong);
            cache.set('playbackState', { isPlaying: true, currentTime: 0, startedAt: Date.now() });
        } else if (currentSong) {
            // Resume playback
            const resumeTime = playbackState.currentTime || 0;
            cache.set('playbackState', {
                isPlaying: true,
                currentTime: resumeTime,
                startedAt: Date.now() - (resumeTime * 1000)
            });
        }
    } else if (action === 'pause') {
        if (playbackState.isPlaying && playbackState.startedAt) {
            const currentTime = (Date.now() - playbackState.startedAt) / 1000;
            cache.set('playbackState', { isPlaying: false, currentTime, startedAt: null });
        }
    }

    res.json({
        playbackState: cache.get('playbackState'),
        currentSong: cache.get('currentSong')
    });
});

// Seek control (admin)
app.post('/api/playback/seek', (req, res) => {
    const { adminKey, time } = req.body; // time in seconds

    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const playbackState = cache.get('playbackState');
    const currentSong = cache.get('currentSong');

    if (!currentSong) {
        return res.status(400).json({ error: 'No song playing' });
    }

    // Adjust startedAt based on new seek time
    // startedAt = now - seekTime
    const newStartedAt = Date.now() - (time * 1000);

    playbackState.currentTime = time;
    playbackState.startedAt = playbackState.isPlaying ? newStartedAt : null;

    cache.set('playbackState', playbackState);

    res.json({ playbackState });
});

// Repeat control (admin)
app.post('/api/playback/repeat', (req, res) => {
    const { adminKey, enabled } = req.body;

    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const playbackState = cache.get('playbackState');
    playbackState.isRepeat = !!enabled;
    cache.set('playbackState', playbackState);

    res.json({ playbackState });
});

// Next song (called by player when song ends or auto-skips)
app.post('/api/songs/next', (req, res) => {
    let songs = cache.get('songs') || [];
    const playbackState = cache.get('playbackState');
    const currentSong = cache.get('currentSong');

    // If Repeat Mode is ON, keep current song and just reset time
    if (playbackState.isRepeat && currentSong) {
        cache.set('playbackState', { ...playbackState, isPlaying: true, currentTime: 0, startedAt: Date.now() });
        return res.json({
            current: currentSong,
            playbackState: cache.get('playbackState')
        });
    }

    // Otherwise move to next song
    if (songs.length > 0) {
        const nextSong = songs.shift();

        // Move current song to history
        if (currentSong) {
            const history = cache.get('history') || {};
            const todayAt = new Date().toISOString().split('T')[0];
            if (!history[todayAt]) history[todayAt] = [];

            // Add to history with played timestamp
            history[todayAt].push({
                ...currentSong,
                playedAt: new Date().toISOString()
            });
            cache.set('history', history);
        }

        cache.set('songs', songs);
        cache.set('currentSong', nextSong);
        cache.set('playbackState', { ...playbackState, isPlaying: true, currentTime: 0, startedAt: Date.now() });
    } else {
        // Even if no next song, save the last one to history
        if (currentSong) {
            const history = cache.get('history') || {};
            const todayAt = new Date().toISOString().split('T')[0];
            if (!history[todayAt]) history[todayAt] = [];
            history[todayAt].push({
                ...currentSong,
                playedAt: new Date().toISOString()
            });
            cache.set('history', history);
        }
        cache.set('currentSong', null);
        cache.set('playbackState', { ...playbackState, isPlaying: false, currentTime: 0, startedAt: null });
    }

    res.json({
        current: cache.get('currentSong'),
        playbackState: cache.get('playbackState')
    });
});

// Get name history
app.get('/api/names', (req, res) => {
    const names = cache.get('names') || [];
    res.json(names);
});

// Get playback history (last 50 songs across all dates)
app.get('/api/history', (req, res) => {
    const history = cache.get('history') || {};
    let allPlayed = [];

    // Flatten and sort by playedAt desc
    Object.keys(history).forEach(date => {
        allPlayed = allPlayed.concat(history[date]);
    });

    allPlayed.sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));

    res.json(allPlayed.slice(0, 50));
});

// Get playback stats (counts per day)
app.get('/api/stats', (req, res) => {
    const history = cache.get('history') || {};
    const stats = {};

    Object.keys(history).forEach(date => {
        stats[date] = history[date].length;
    });

    res.json(stats);
});

// Validate link
app.post('/api/validate/link', async (req, res) => {
    try {
        let { url } = req.body;

        if (!url) {
            return res.status(400).json({ valid: false, error: 'No URL provided' });
        }

        // Try to resolve directly
        const videoInfo = await resolveToVideo(url);
        if (videoInfo) {
            res.json({ valid: true, videoInfo });
        } else {
            res.status(400).json({ valid: false, error: 'ไม่พบวิดีโอที่ต้องการ หรือลิงก์ไม่ถูกต้อง' });
        }
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ valid: false, error: error.message });
    }
});

// Search YouTube
app.get('/api/search/youtube', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q) {
            return res.json([]);
        }

        const results = await searchYouTube(q);
        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;

    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, adminKey: ADMIN_PASSWORD });
    } else {
        res.status(401).json({ success: false, error: 'รหัสผ่านไม่ถูกต้อง' });
    }
});

// Toggle Cinema Mode
app.post('/api/admin/cinema', (req, res) => {
    const { adminKey } = req.body;
    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentState = cache.get('playbackState');
    const newState = { ...currentState, cinemaMode: !currentState.cinemaMode };
    cache.set('playbackState', newState);

    res.json({ success: true, cinemaMode: newState.cinemaMode });
});

// Adjust Volume
app.post('/api/admin/volume', (req, res) => {
    const { adminKey, volume } = req.body;
    if (adminKey !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentState = cache.get('playbackState');
    const newState = { ...currentState, volume: Math.max(0, Math.min(100, parseInt(volume) || 100)) };
    cache.set('playbackState', newState);

    res.json({ success: true, volume: newState.volume });
});



// Get all local IP addresses for network access
function getLocalIPs() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips.length > 0 ? ips : ['localhost'];
}

// Start server - listen on all interfaces for network access
const server = app.listen(PORT, '0.0.0.0', () => {
    const localIPs = getLocalIPs();
    const white = '\x1b[97m';
    const reset = '\x1b[0m';
    const cyan = '\x1b[36m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';

    console.log(white);
    console.log('═══════════════════════════════════════════════════════');
    console.log(`   🎵 ระบบขอเพลง (Song Request System) ${green}เริ่มทำงานแล้ว!${white}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log(`🔐 รหัสแอดมิน: ${yellow}${ADMIN_PASSWORD}${white}`);
    console.log('');
    console.log(`📍 URLs (สำหรับเครื่องนี้):`);
    console.log(`   - หน้าขอเพลง :   http://localhost:${PORT}`);
    console.log(`   - หน้าแอดมิน :  http://localhost:${PORT}/admin.html`);
    console.log(`   - หน้าเครื่องเล่น : http://localhost:${PORT}/player.html`);
    console.log('');
    console.log(`🌐 URLs (สำหรับคนอื่นในวงแลน):`);
    localIPs.forEach(ip => {
        console.log(`   - IP : ${cyan}${ip}${white}`);
        console.log(`     👉 หน้าขอเพลง :   http://${ip}:${PORT}`);
        console.log(`     👉 หน้าแอดมิน :  http://${ip}:${PORT}/admin.html`);
    });
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log(reset);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ ${white}Error: Port ${PORT} is already in use.${reset}`);
        console.error(`${white}👉 วิธีแก้: ปิด Terminal เก่า หรือไปที่ Task Manager -> End Task โปรแกรม 'node.exe' ให้หมดแล้วรันใหม่${reset}\n`);
    } else {
        console.error('❌ Server error:', err);
    }
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
