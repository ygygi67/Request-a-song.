// ===== Admin State =====
let adminKey = localStorage.getItem('adminKey') || null;
let isPlaying = false;
let isDraggingSeekBar = false; // Prevent slider snapping while dragging
let currentSong = null;
let updateInterval = null;
let adminQueueIds = new Set(); // Track seen songs to avoid re-animating

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

        if (text) text.textContent = 'ซิงก์ข้อมูลล่าสุด: ' + new Date().toLocaleTimeString();
    } catch (e) {
        console.error('Refresh error:', e);
        if (text) text.textContent = 'การซิงก์ขัดข้อง จะลองใหม่ใน 5 วิ';
    } finally {
        if (dot) dot.classList.remove('updating');
    }
}

async function loadQueue() {
    try {
        const response = await fetch('/api/songs');
        const songs = await response.json();

        // Update stats
        document.getElementById('statQueue').textContent = songs.length;
        document.getElementById('statTotal').textContent = songs.length;

        const totalMinutes = songs.reduce((sum, s) => sum + (s.duration || 180) / 60, 0);
        document.getElementById('statTime').textContent = Math.ceil(totalMinutes) + ' นาที';

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
        document.getElementById('npThumbnail').src = info.thumbnail || 'https://via.placeholder.com/480x270?text=🎵';
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
        document.getElementById('npThumbnail').src = 'https://via.placeholder.com/480x270?text=🎵';
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
// ===== Load Stats =====
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        renderStats(stats);

        // Update total songs played today in the top stat card
        const today = new Date().toISOString().split('T')[0];
        const statTotalEl = document.getElementById('statTotal');
        if (statTotalEl) {
            statTotalEl.textContent = stats[today] || 0;
            const label = statTotalEl.nextElementSibling;
            if (label) label.textContent = 'เล่นไปแล้ววันนี้';
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ===== Render Stats =====
function renderStats(stats) {
    const statsList = document.getElementById('statsList');
    if (!statsList) return;

    const dates = Object.keys(stats).sort((a, b) => new Date(b) - new Date(a));

    if (dates.length === 0) {
        statsList.innerHTML = '<p class="text-center text-muted">ยังไม่มีสถิติ</p>';
        return;
    }

    statsList.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px;">
            ${dates.map(date => {
        const isToday = date === new Date().toISOString().split('T')[0];
        return `
                    <div class="stat-card" style="padding: 15px; border: 1px solid ${isToday ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)'}; background: ${isToday ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.02)'}; border-radius: 12px; text-align: center;">
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 5px;">${formatDisplayDate(date)}</div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: ${isToday ? 'var(--accent-primary)' : 'white'};">${stats[date]} เพลง</div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
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
