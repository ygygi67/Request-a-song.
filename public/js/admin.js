// ===== Admin State =====
let adminKey = localStorage.getItem('adminKey') || null;
let isPlaying = false;
let isDraggingSeekBar = false; // Prevent slider snapping while dragging
let currentSong = null;
let updateInterval = null;
let adminQueueIds = new Set(); // Track seen songs to avoid re-animating
let isOffline = false;

// ===== Connection Monitoring =====
function updateConnectionStatus() {
    const warning = document.getElementById('connectionWarning');
    if (!warning) return;

    if (!navigator.onLine) {
        warning.textContent = '❌ อินเทอร์เน็ตขาดการเชื่อมต่อ - กรุณาตรวจสอบเน็ตของคุณ';
        warning.classList.add('active');
        isOffline = true;
    } else if (isOffline) {
        warning.textContent = '⚠️ กำลังพยายามจัดตั้งการเชื่อมต่อกับเซิร์ฟเวอร์ใหม่...';
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

function setConnectionError(active, message) {
    const warning = document.getElementById('connectionWarning');
    if (!warning) return;

    if (active) {
        if (message) warning.textContent = message;
        warning.classList.add('active');
    } else {
        warning.classList.remove('active');
        isOffline = false;
    }
}

// ===== DOM Elements =====
const loginScreen = document.getElementById('loginScreen');
const adminDashboard = document.getElementById('adminDashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', async () => {
    if (adminKey) {
        const isValid = await validateSession();
        if (isValid) {
            showDashboard();
        } else {
            logout();
        }
    }

    loginForm.addEventListener('submit', handleLogin);

    const seekBar = document.getElementById('seekBar');
    if (seekBar) {
        seekBar.addEventListener('mousedown', () => isDraggingSeekBar = true);
        seekBar.addEventListener('touchstart', () => isDraggingSeekBar = true);
        seekBar.addEventListener('mouseup', () => isDraggingSeekBar = false);
        seekBar.addEventListener('touchend', () => isDraggingSeekBar = false);
    }

    detectOnlineMode();
});

// Detect if running on Online Tunnel
function detectOnlineMode() {
    const host = window.location.hostname;
    if (host.includes('localtunnel.me') || host.includes('lt.dev')) {
        const dashboard = document.querySelector('.admin-container') || document.body;
        const badge = document.createElement('div');
        badge.style.position = 'fixed';
        badge.style.top = '10px';
        badge.style.right = '10px';
        badge.style.background = 'rgba(0, 255, 136, 0.15)';
        badge.style.color = '#00ff88';
        badge.style.border = '1px solid #00ff88';
        badge.style.padding = '4px 12px';
        badge.style.borderRadius = '50px';
        badge.style.fontSize = '0.75rem';
        badge.style.fontWeight = 'bold';
        badge.style.zIndex = '9999';
        badge.innerHTML = '🌐 Online Mode';
        dashboard.appendChild(badge);
    }
}

async function validateSession() {
    try {
        const response = await fetch('/api/playback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey, action: 'check' })
        });
        return response.status !== 401;
    } catch (e) { return false; }
}

// ===== Login =====
async function handleLogin(e) {
    e.preventDefault();

    const password = document.getElementById('passwordInput').value;

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (data.success) {
            adminKey = data.adminKey;
            localStorage.setItem('adminKey', adminKey);
            showDashboard();
        } else {
            loginError.textContent = data.error || 'รหัสผ่านไม่ถูกต้อง';
        }
    } catch (error) {
        loginError.textContent = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    }
}

function logout() {
    adminKey = null;
    localStorage.removeItem('adminKey');
    loginScreen.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
    if (updateInterval) clearInterval(updateInterval);
}

function showDashboard() {
    loginScreen.classList.add('hidden');
    adminDashboard.classList.remove('hidden');
    loadData();

    // Auto refresh every 5 seconds
    updateInterval = setInterval(loadData, 5000);
}

// ===== Load Data =====
async function loadData() {
    const dot = document.getElementById('updateDot');
    const text = document.getElementById('updateText');

    if (dot) dot.classList.add('updating');
    if (text) text.textContent = 'กำลังซิงก์ข้อมูล...';

    try {
        await Promise.all([
            loadQueue(),
            loadCurrentSong(),
            loadStats()
        ]);
        setConnectionError(false);
        if (text) text.textContent = 'ซิงก์ข้อมูลล่าสุด: ' + new Date().toLocaleTimeString();
    } catch (e) {
        console.error('Refresh error:', e);
        setConnectionError(true, '⚠️ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ - กำลังลองใหม่...');
        if (text) text.textContent = 'การซิงก์ขัดข้อง จะลองใหม่ใน 5 วิ';
    } finally {
        if (dot) dot.classList.remove('updating');
    }
}

async function loadQueue() {
    try {
        const response = await fetch('/api/songs');
        const songs = await response.json();

        // Update basic queue stats
        document.getElementById('statQueue').textContent = songs.length;

        renderAdminQueue(songs);
    } catch (error) {
        console.error('Error loading queue:', error);
    }
}

async function loadCurrentSong() {
    try {
        const response = await fetch('/api/songs/current');
        const data = await response.json();

        currentSong = data.current;
        isPlaying = data.isPlaying;

        updateNowPlaying(data);
        updateNextSong(data.nextSong);

        // Update stats from server
        if (data.stats) {
            const todayCountEl = document.getElementById('statToday');
            const totalPlayedEl = document.getElementById('statTotalPlayed');
            if (todayCountEl) todayCountEl.textContent = data.stats.todayCount || 0;
            if (totalPlayedEl) totalPlayedEl.textContent = data.stats.totalPlayed || 0;
        }

        // Sync Lyrics Mode UI
        const lyricsToggle = document.getElementById('lyricsToggle');
        const lyricsInput = document.getElementById('lyricsInput');
        if (lyricsToggle && data.playbackState) {
            lyricsToggle.checked = data.playbackState.lyricsMode;
        }
        if (lyricsInput && data.playbackState && !lyricsInput.matches(':focus')) {
            lyricsInput.value = data.playbackState.currentLyrics || '';
        }
    } catch (error) {
        console.error('Error loading current song:', error);
    }
}

// ===== Update UI =====
function updateNowPlaying(data) {
    const song = data.current;
    const playBtn = document.getElementById('playBtn');
    const repeatBtn = document.getElementById('repeatBtn');
    const seekBar = document.getElementById('seekBar');

    if (song) {
        const info = song.videoInfo || {};
        const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='270' viewBox='0 0 480 270'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-size='40' text-anchor='middle' dy='15'%3E🎵%3C/text%3E%3C/svg%3E";
        document.getElementById('npThumbnail').src = info.thumbnail || info.thumbnailMedium || placeholder;
        document.getElementById('npTitle').textContent = song.songName;
        document.getElementById('npArtist').textContent = info.author || song.name || '-';

        const duration = song.duration || 180;
        const currentTime = data.currentTime || 0;
        const progress = (currentTime / duration) * 100;

        document.getElementById('npProgress').style.width = progress + '%';
        document.getElementById('npCurrentTime').textContent = formatDuration(currentTime);
        document.getElementById('npDuration').textContent = formatDuration(duration);

        if (seekBar && !isDraggingSeekBar) {
            seekBar.value = progress;
            seekBar.disabled = false;
        }
    } else {
        const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='270' viewBox='0 0 480 270'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-size='40' text-anchor='middle' dy='15'%3E🎵%3C/text%3E%3C/svg%3E";
        document.getElementById('npThumbnail').src = placeholder;
        document.getElementById('npTitle').textContent = 'ไม่มีเพลงที่เล่น';
        document.getElementById('npArtist').textContent = '-';
        document.getElementById('npProgress').style.width = '0%';
        document.getElementById('npCurrentTime').textContent = '0:00';
        document.getElementById('npDuration').textContent = '0:00';

        if (seekBar) {
            seekBar.value = 0;
            seekBar.disabled = true;
        }
    }

    if (playBtn) playBtn.textContent = data.isPlaying ? '⏸️' : '▶️';
    if (repeatBtn) {
        if (data.isRepeat) {
            repeatBtn.classList.add('active');
            repeatBtn.title = 'ปิดโหมดวนซ้ำ';
        } else {
            repeatBtn.classList.remove('active');
            repeatBtn.title = 'เปิดโหมดวนซ้ำ';
        }
    }
}

function updateNextSong(song) {
    const nextActions = document.getElementById('nextActions');
    const rejectNextBtn = document.getElementById('rejectNextBtn');

    const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-size='100' fill='%236366f1' text-anchor='middle' dy='35'%3E🎵%3C/text%3E%3C/svg%3E";

    if (song) {
        const info = song.videoInfo || {};
        const thumbnail = info.thumbnailMedium || info.thumbnail || placeholder;

        const imgEl = document.getElementById('nextThumbnail');
        imgEl.src = thumbnail;
        imgEl.onerror = function () { this.src = placeholder; };

        document.getElementById('nextTitle').textContent = song.songName;
        document.getElementById('nextArtist').textContent = info.author || song.name || '-';

        if (nextActions) nextActions.style.display = 'block';
        if (rejectNextBtn) {
            rejectNextBtn.onclick = () => rejectSong(song.id);
        }
    } else {
        document.getElementById('nextThumbnail').src = placeholder;
        document.getElementById('nextTitle').textContent = 'ไม่มีเพลงถัดไป';
        document.getElementById('nextArtist').textContent = '-';

        if (nextActions) nextActions.style.display = 'none';
    }
}

function renderAdminQueue(songs) {
    const container = document.getElementById('adminQueueList');
    const emptyEl = document.getElementById('adminEmptyQueue');

    if (!container) return;

    if (!songs || songs.length === 0) {
        container.innerHTML = '';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            container.appendChild(emptyEl);
        }
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    // Track current IDs to detect new items
    const currentIds = new Set(songs.map(s => s.id));

    container.innerHTML = songs.map((song, index) => {
        const info = song.videoInfo || {};
        const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='270' viewBox='0 0 480 270'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-size='40' text-anchor='middle' dy='15'%3E🎵%3C/text%3E%3C/svg%3E";
        const thumbnail = info.thumbnailMedium || info.thumbnail || placeholder;

        // Apply animate-in only if ID is new
        const isNew = !adminQueueIds.has(song.id);
        const animationClass = isNew ? 'animate-in' : '';

        return `
            <div class="queue-item ${animationClass} ${song.isDuplicate ? 'duplicate' : ''}" data-id="${song.id}">
                <div class="queue-number">${song.queueNumber}</div>
                <img src="${thumbnail}" alt="" class="queue-thumbnail" onerror="this.src='${placeholder}'">
                <div class="queue-info">
                    <div class="queue-title">
                        ${song.link ? `<a href="${song.link}" target="_blank">${escapeHtml(song.songName)}</a>` : escapeHtml(song.songName)}
                        ${song.isDuplicate ? '<span class="badge badge-duplicate">ซ้ำ</span>' : ''}
                    </div>
                    <div class="queue-meta">
                        ${info.author ? `<span>🎤 ${escapeHtml(info.author)}</span>` : ''}
                        <span>👤 ${escapeHtml(song.name)}</span>
                        <span>👍 ${song.votes.up} / 👎 ${song.votes.down}</span>
                    </div>
                </div>
                <div class="queue-actions">
                    <button class="btn btn-primary btn-sm" onclick="prioritizeSong('${song.id}')" title="ลัดคิวเป็นลำดับแรก">
                        ⭐ ลัดคิว
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="openEditModal('${song.id}', '${escapeHtml(song.link || '')}')" title="แก้ไขลิงก์">
                        🔗 แก้ไข
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="rejectSong('${song.id}')" title="ปฏิเสธ">
                        ❌ ปฏิเสธ
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Update the tracker
    adminQueueIds = currentIds;
}

// ===== Playback Controls =====
async function togglePlay() {
    try {
        const action = isPlaying ? 'pause' : 'play';

        const response = await fetch('/api/playback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey, action })
        });

        if (response.status === 401) {
            showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
            setTimeout(logout, 2000);
            return;
        }

        if (response.ok) {
            loadCurrentSong();
            loadQueue();
            showToast(action === 'play' ? '▶️ กำลังเล่น' : '⏸️ หยุดชั่วคราว', 'success');
        } else {
            showToast('เกิดข้อผิดพลาด', 'error');
        }
    } catch (error) {
        console.error('Playback error:', error);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function skipSong() {
    try {
        const response = await fetch('/api/songs/skip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey })
        });

        if (response.status === 401) {
            showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
            setTimeout(logout, 2000);
            return;
        }

        if (response.ok) {
            loadCurrentSong();
            loadQueue();
            showToast('⏭️ ข้ามไปเพลงถัดไป', 'success');
        } else {
            showToast('เกิดข้อผิดพลาด', 'error');
        }
    } catch (error) {
        console.error('Skip error:', error);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function stopPlayback() {
    try {
        const response = await fetch('/api/playback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey, action: 'pause' })
        });

        if (response.ok) {
            loadCurrentSong();
            loadQueue();
            showToast('⏹️ หยุดเล่น', 'success');
        }
    } catch (error) {
        console.error('Stop error:', error);
    }
}

async function handleSeek(percent) {
    if (!currentSong) return;
    const duration = currentSong.duration || 180;
    const seekTime = (percent / 100) * duration;

    try {
        const response = await fetch('/api/playback/seek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey, time: seekTime })
        });

        if (response.ok) {
            loadCurrentSong();
            showToast(`⏭️ เลื่อนไปที่ ${formatDuration(seekTime)}`, 'success');
        }
    } catch (e) { console.error('Seek error:', e); }
}

async function adjustTime(delta) {
    if (!currentSong) return;

    try {
        // First get current fresh time from server
        const statusRes = await fetch('/api/songs/current');
        const status = await statusRes.json();

        const duration = currentSong.duration || 180;
        let newTime = (status.currentTime || 0) + delta;
        newTime = Math.max(0, Math.min(newTime, duration - 1));

        const response = await fetch('/api/playback/seek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey, time: newTime })
        });

        if (response.ok) {
            loadCurrentSong();
            showToast(delta > 0 ? `⏩ ไปข้างหน้า ${delta} วิ` : `⏪ ย้อนกลับ ${Math.abs(delta)} วิ`, 'success');
        }
    } catch (e) { console.error('Adjust time error:', e); }
}

async function toggleCinema() {
    try {
        const response = await fetch('/api/admin/cinema', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey })
        });

        if (response.ok) {
            const data = await response.json();
            showToast(data.cinemaMode ? '🖵 เปิดโหมดโรงหนัง' : 'ออกจากโหมดโรงหนัง', 'success');
        } else {
            showToast('เกิดข้อผิดพลาดในการเปลี่ยนโหมด', 'error');
        }
    } catch (e) {
        console.error('Toggle cinema error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function toggleLyricsMode(enabled) {
    try {
        const lyrics = document.getElementById('lyricsInput').value;
        const response = await fetch('/api/admin/lyrics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey, enabled, lyrics })
        });
        if (response.ok) {
            showToast(enabled ? '📝 เปิดโหมดเนื้อเพลง' : '📋 กลับสู่โหมดคิวเพลง', 'success');
        }
    } catch (e) { console.error('Lyrics error:', e); }
}

async function updateLyrics(lyrics) {
    try {
        const enabled = document.getElementById('lyricsToggle').checked;
        await fetch('/api/admin/lyrics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey, enabled, lyrics })
        });
    } catch (e) { console.error('Update lyrics error:', e); }
}

async function toggleRepeat() {
    const repeatBtn = document.getElementById('repeatBtn');
    const currentlyEnabled = repeatBtn.classList.contains('active');

    try {
        const response = await fetch('/api/playback/repeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey, enabled: !currentlyEnabled })
        });

        if (response.ok) {
            loadCurrentSong();
            showToast(!currentlyEnabled ? '🔁 เปิดโหมดวนซ้ำ' : '➡️ ปิดโหมดวนซ้ำ', 'success');
        }
    } catch (e) { console.error('Repeat error:', e); }
}

let volumeDebounceTimer;
async function adjustVolume(value) {
    document.getElementById('volumeValue').innerText = `${value}%`;

    clearTimeout(volumeDebounceTimer);
    volumeDebounceTimer = setTimeout(async () => {
        try {
            await fetch('/api/admin/volume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminKey, volume: parseInt(value) })
            });
        } catch (e) { console.error('Volume error:', e); }
    }, 500); // Debounce sending to server
}

// ===== Reject Song =====
async function rejectSong(songId) {
    if (!confirm('ต้องการปฏิเสธเพลงนี้หรือไม่?')) {
        return;
    }

    try {
        const response = await fetch(`/api/songs/${songId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey })
        });

        if (response.status === 401) {
            showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
            setTimeout(logout, 2000);
            return;
        }

        if (response.ok) {
            loadData();
            showToast('❌ ปฏิเสธเพลงเรียบร้อย', 'success');
        } else {
            const data = await response.json();
            showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
        }
    } catch (error) {
        console.error('Reject error:', error);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

// ===== Utilities =====
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.warn('Toast container not found:', message);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Edit Link Modal Logic =====
let currentEditId = null;

function openEditModal(id, currentLink) {
    currentEditId = id;
    document.getElementById('newLinkInput').value = currentLink;
    document.getElementById('editModal').classList.add('show');
    document.getElementById('editError').textContent = '';
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
    currentEditId = null;
}

async function saveSongLink() {
    const newLink = document.getElementById('newLinkInput').value.trim();
    if (!newLink) {
        document.getElementById('editError').textContent = 'กรุณากรอกลิงก์';
        return;
    }

    const saveBtn = document.getElementById('saveLinkBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'กำลังบันทึก...';

    try {
        const response = await fetch(`/api/songs/${currentEditId}/link`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey, link: newLink })
        });

        const data = await response.json();

        if (response.ok) {
            closeEditModal();
            loadCurrentSong();
            loadQueue();
            showToast('✅ อัปเดตลิงก์เรียบร้อยแล้ว', 'success');
        } else {
            document.getElementById('editError').textContent = data.error || 'เกิดข้อผิดพลาด';
        }
    } catch (error) {
        document.getElementById('editError').textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'บันทึก';
    }
}

// ===== Prioritize Song =====
async function prioritizeSong(songId) {
    try {
        const response = await fetch(`/api/songs/${songId}/priority`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey })
        });

        if (response.ok) {
            loadData();
            showToast('⭐ ลัดคิวเพลงนี้ขึ้นมาเป็นลำดับแรกแล้ว', 'success');
        } else {
            const data = await response.json();
            showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
        }
    } catch (error) {
        console.error('Priority error:', error);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

// ===== Full Screen Logic =====
document.addEventListener('DOMContentLoaded', () => {
    const fsBtn = document.getElementById('fullscreenBtn');
    if (fsBtn) {
        fsBtn.addEventListener('click', toggleFullScreen);
    }

    const videoFsBtn = document.getElementById('videoFsBtn');
    if (videoFsBtn) {
        videoFsBtn.addEventListener('click', toggleThumbnailFullScreen);
    }

    // Auto-hide UI controls on idle mouse (Global Fullscreen)
    let mouseTimer;
    document.addEventListener('mousemove', () => {
        document.body.classList.remove('hide-cursor');
        if (fsBtn) fsBtn.style.opacity = '1';
        clearTimeout(mouseTimer);
        mouseTimer = setTimeout(() => {
            if (!document.fullscreenElement) return;
            document.body.classList.add('hide-cursor');
            if (fsBtn) fsBtn.style.opacity = '0';
        }, 3000);
    });
});

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(e => {
            console.error(`Error attempting to enable full-screen mode: ${e.message}`);
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

function toggleThumbnailFullScreen() {
    const nowPlayingDiv = document.getElementById('nowPlaying');
    if (!nowPlayingDiv) return;

    if (!document.fullscreenElement) {
        nowPlayingDiv.requestFullscreen().catch(e => {
            console.error(`Error attempting to enable thumbnail full-screen mode: ${e.message}`);
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}
// ===== History Modal Functions =====
function openHistory() {
    console.log('Opening history modal...');
    const modal = document.getElementById('historyModal');
    if (modal) {
        modal.classList.add('active');
        loadHistory();
    } else {
        console.error('History modal element not found!');
    }
}

function closeHistory() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.remove('active');
}

async function loadHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;

    try {
        const response = await fetch('/api/history');
        let history = await response.json();

        if (!history || history.length === 0) {
            list.innerHTML = '<div class="text-center py-4 text-muted">ยังไม่มีประวัติการเล่นเพลง</div>';
            return;
        }

        // Populate date filter dropdown
        const dateFilter = document.getElementById('historyDateFilter');
        if (dateFilter) {
            const dates = [...new Set(history.map(h => h.playedAt?.split('T')[0]).filter(Boolean))].sort().reverse();
            const currentValue = dateFilter.value;

            // Only rebuild if options have changed
            const existingDates = Array.from(dateFilter.options).map(o => o.value).slice(1);
            if (JSON.stringify(dates) !== JSON.stringify(existingDates)) {
                dateFilter.innerHTML = '<option value="all">ทั้งหมด</option>' +
                    dates.map(d => `<option value="${d}">${formatDisplayDate(d)}</option>`).join('');
                dateFilter.value = currentValue || 'all';
            }
        }

        // Filter by date
        const selectedDate = dateFilter ? dateFilter.value : 'all';
        if (selectedDate !== 'all') {
            history = history.filter(h => h.playedAt?.startsWith(selectedDate));
        }

        // Get sorting option
        const sortSelect = document.getElementById('historySortBy');
        const sortBy = sortSelect ? sortSelect.value : 'time-desc';

        // Sort history
        history.sort((a, b) => {
            switch (sortBy) {
                case 'time-asc':
                    return new Date(a.playedAt) - new Date(b.playedAt);
                case 'time-desc':
                    return new Date(b.playedAt) - new Date(a.playedAt);
                case 'name-asc':
                    return (a.songName || '').localeCompare(b.songName || '', 'th');
                case 'name-desc':
                    return (b.songName || '').localeCompare(a.songName || '', 'th');
                case 'requester-asc':
                    return (a.name || '').localeCompare(b.name || '', 'th');
                default:
                    return new Date(b.playedAt) - new Date(a.playedAt);
            }
        });

        list.innerHTML = history.map(item => {
            const info = item.videoInfo || {};
            const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='270' viewBox='0 0 480 270'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-size='40' text-anchor='middle' dy='15'%3E🎵%3C/text%3E%3C/svg%3E";
            const thumbnail = info.thumbnailMedium || info.thumbnail || placeholder;
            const playedTime = new Date(item.playedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            const playedDate = new Date(item.playedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

            return `
                <div class="history-item">
                    <img src="${thumbnail}" alt="" class="history-thumb" onerror="this.src='${placeholder}'">
                    <div class="history-info">
                        <div class="history-title" title="${escapeHtml(item.songName)}">
                            ${escapeHtml(item.songName)}
                            ${item.status === 'rejected' ? '<span class="badge-status-rejected">Rejected</span>' : '<span class="badge-status-completed">Played</span>'}
                        </div>
                        <div class="history-meta">
                            <span>🎤 ${escapeHtml(info.author || 'ไม่ระบุศิลปิน')}</span>
                            <span>👤 ${escapeHtml(item.name)}</span>
                        </div>
                        <div class="history-meta">
                            <span>🕒 ${playedDate} ${playedTime} น.</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading history:', error);
        list.innerHTML = '<div class="text-center py-4 text-danger">ไม่สามารถโหลดข้อมูลได้</div>';
    }
}

async function loadStats() {
    // Currently stats are updated via loadCurrentSong results
    // You can also add specific stats logic here if needed
}

// Utility: Format YYYY-MM-DD to display text
function formatDisplayDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) return 'วันนี้';

    return date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit'
    });
}
