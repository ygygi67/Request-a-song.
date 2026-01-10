// ===== API Base URL =====
const API_BASE = '';

// ===== DOM Elements =====
const requestForm = document.getElementById('requestForm');
const nameInput = document.getElementById('nameInput');
const songInput = document.getElementById('songInput');
const linkInput = document.getElementById('linkInput');
const nameDropdown = document.getElementById('nameDropdown');
const songDropdown = document.getElementById('songDropdown');
const linkPreview = document.getElementById('linkPreview');
const queueList = document.getElementById('queueList');
const historyList = document.getElementById('historyList'); // Add this
const emptyQueue = document.getElementById('emptyQueue');
const submitBtn = document.getElementById('submitBtn');
const duplicateModal = document.getElementById('duplicateModal');

// ===== State =====
let names = [];
let pendingRequest = null;
let searchTimeout = null;
let selectedVideoInfo = null;
let lastQueueIds = new Set(); // Track already seen song IDs to avoid re-animating

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    // Load saved name
    const savedName = localStorage.getItem('savedName');
    if (savedName) {
        nameInput.value = savedName;
    }

    loadNames();
    loadQueue();
    loadHistory(); // Add this
    setupEventListeners();
    detectOnlineMode();

    // Auto refresh every 10 seconds
    setInterval(() => {
        loadQueue();
        loadHistory();
    }, 10000);

    // Update countdowns every second
    setInterval(updateCountdowns, 1000);
});

// Detect if running on Online Tunnel
function detectOnlineMode() {
    const host = window.location.hostname;
    if (host.includes('localtunnel.me') || host.includes('lt.dev')) {
        const header = document.querySelector('.header');
        if (header) {
            const badge = document.createElement('div');
            badge.style.display = 'inline-block';
            badge.style.background = 'rgba(0, 255, 136, 0.15)';
            badge.style.color = '#00ff88';
            badge.style.border = '1px solid #00ff88';
            badge.style.padding = '2px 10px';
            badge.style.borderRadius = '50px';
            badge.style.fontSize = '0.7rem';
            badge.style.marginTop = '10px';
            badge.style.fontWeight = 'bold';
            badge.innerHTML = '🌐 Online Mode';
            header.appendChild(badge);
        }
    }
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Form submit
    requestForm.addEventListener('submit', handleSubmit);

    // Name autocomplete
    nameInput.addEventListener('input', handleNameInput);
    nameInput.addEventListener('focus', () => showNameDropdown());

    // Song search
    songInput.addEventListener('input', handleSongInput);

    // Link validation
    linkInput.addEventListener('input', debounce(handleLinkInput, 500));
    linkInput.addEventListener('paste', (e) => {
        setTimeout(() => handleLinkInput(), 100);
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-wrapper')) {
            nameDropdown.classList.remove('show');
            songDropdown.classList.remove('show');
        }
    });
}

// ===== Load Names History =====
async function loadNames() {
    try {
        const response = await fetch(`${API_BASE}/api/names`);
        names = await response.json();
    } catch (error) {
        console.error('Error loading names:', error);
    }
}

// ===== Name Autocomplete =====
function handleNameInput() {
    const value = nameInput.value.toLowerCase();

    if (!value) {
        showNameDropdown();
        return;
    }

    const filtered = names.filter(name =>
        name.toLowerCase().includes(value)
    );

    renderNameDropdown(filtered);
}

function showNameDropdown() {
    if (names.length === 0) {
        nameDropdown.classList.remove('show');
        return;
    }

    renderNameDropdown(names.slice(0, 5));
}

function renderNameDropdown(items) {
    if (items.length === 0) {
        nameDropdown.classList.remove('show');
        return;
    }

    nameDropdown.innerHTML = items.map(name => `
        <div class="autocomplete-item" onclick="selectName('${escapeHtml(name)}')">
            <span>👤</span>
            <span>${escapeHtml(name)}</span>
        </div>
    `).join('');

    nameDropdown.classList.add('show');
}

function selectName(name) {
    nameInput.value = name;
    nameDropdown.classList.remove('show');
}

// ===== Song Search =====
function handleSongInput() {
    const query = songInput.value.trim();

    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    if (query.length < 2) {
        songDropdown.classList.remove('show');
        return;
    }

    searchTimeout = setTimeout(() => searchYouTube(query), 300);
}

async function searchYouTube(query) {
    try {
        // Show loading
        songDropdown.innerHTML = `
            <div class="autocomplete-item">
                <span>🔍</span>
                <span>กำลังค้นหา...</span>
            </div>
        `;
        songDropdown.classList.add('show');

        // Fetch results from server
        const response = await fetch(`${API_BASE}/api/search/youtube?q=${encodeURIComponent(query)}`);
        const results = await response.json();

        if (!results || results.length === 0) {
            songDropdown.innerHTML = `
                <div class="autocomplete-item">
                    <span>😕</span>
                    <span>ไม่พบผลการค้นหา</span>
                </div>
            `;
            return;
        }

        renderSongSuggestions(results);
    } catch (error) {
        console.error('Search error:', error);
    }
}

function renderSongSuggestions(results) {
    songDropdown.innerHTML = '';
    results.slice(0, 5).forEach(item => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.innerHTML = `
            ${item.thumbnail ? `<img src="${item.thumbnail}" alt="">` : '<span>🎵</span>'}
            <div class="info">
                <div class="title">${escapeHtml(item.title)}</div>
                <div class="meta">${escapeHtml(item.author || '')}</div>
            </div>
        `;
        div.onclick = () => selectSong(item);
        songDropdown.appendChild(div);
    });
    songDropdown.classList.add('show');
}

function selectSong(song) {
    songInput.value = song.title;
    if (song.url) {
        // If it's a suggestion only, it's just a title/query
        // But if it's a video, it has a watch URL
        linkInput.value = song.url;
        handleLinkInput(); // Trigger validation for the new link
    }
    songDropdown.classList.remove('show');
}

// ===== Link Validation =====
async function handleLinkInput() {
    const url = linkInput.value.trim();
    const errorEl = document.getElementById('linkError');

    if (!url) {
        errorEl.textContent = '';
        linkPreview.classList.add('hidden');
        selectedVideoInfo = null;
        return;
    }

    // Check if it's a supported music URL
    const musicPatterns = [
        /youtube\.com\/watch\?v=/,
        /youtu\.be\//,
        /music\.youtube\.com\/watch\?v=/,
        /spotify\.com\/track\//,
        /soundcloud\.com\//,
        /music\.apple\.com\//
    ];

    const isValidPattern = musicPatterns.some(p => p.test(url));
    if (!isValidPattern) {
        errorEl.textContent = '❌ รองรับ: YouTube, Spotify, SoundCloud, Apple Music';
        errorEl.style.color = 'var(--danger)';
        linkPreview.classList.add('hidden');
        return;
    }

    // Validate with server
    try {
        errorEl.textContent = '🔍 กำลังตรวจสอบ...';
        errorEl.style.color = 'var(--text-muted)';

        const response = await fetch(`${API_BASE}/api/validate/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (data.valid) {
            errorEl.textContent = '✅ ลิงค์ถูกต้อง';
            errorEl.style.color = 'var(--success)';
            selectedVideoInfo = data.videoInfo;
            showLinkPreview(data.videoInfo);

            // Auto-fill song name if empty
            if (!songInput.value && data.videoInfo.title) {
                songInput.value = data.videoInfo.title;
            }
        } else {
            errorEl.textContent = `❌ ${data.error || 'ลิงค์ไม่ถูกต้อง'}`;
            errorEl.style.color = 'var(--danger)';
            linkPreview.classList.add('hidden');
            selectedVideoInfo = null;
        }
    } catch (error) {
        errorEl.textContent = '❌ ไม่สามารถตรวจสอบลิงค์ได้';
        errorEl.style.color = 'var(--danger)';
    }
}

function showLinkPreview(info) {
    linkPreview.innerHTML = `
        <div class="up-next">
            <img src="${info.thumbnailMedium || info.thumbnail || 'https://via.placeholder.com/80x45'}" alt="" style="width: 80px; height: 45px; border-radius: 4px; object-fit: cover;">
            <div class="up-next-info">
                <div class="up-next-title">${escapeHtml(info.title)}</div>
                <div class="up-next-artist">${escapeHtml(info.author || '')}</div>
            </div>
        </div>
    `;
    linkPreview.classList.remove('hidden');
}

// ===== Form Submit =====
async function handleSubmit(e) {
    e.preventDefault();

    const name = nameInput.value.trim();
    const songName = songInput.value.trim();
    const link = linkInput.value.trim();

    // Validate song name
    if (!songName) {
        showToast('กรุณาใส่ชื่อเพลง', 'error');
        return;
    }

    // Prepare request
    const requestData = {
        name,
        songName,
        link,
        videoInfo: selectedVideoInfo
    };

    // Submit
    try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span> กำลังส่ง...';

        const response = await fetch(`${API_BASE}/api/songs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        let data;
        const text = await response.text();
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('SERVER RESPONSE ERROR:', text);
            throw new Error('Server returned invalid JSON');
        }

        if (!response.ok) {
            if (data.isDuplicate) {
                pendingRequest = { ...requestData, confirmDuplicate: true };
                duplicateModal.classList.add('show');
            } else {
                showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
            }
            return;
        }

        // Success
        showToast('✅ ส่งคำขอเพลงเรียบร้อยแล้ว!', 'success');
        resetForm();
        loadQueue();

    } catch (error) {
        console.error('Submit error:', error);
        showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>📤</span><span>ส่งคำขอเพลง</span>';
    }
}

function resetForm() {
    // Save name for next time
    localStorage.setItem('savedName', nameInput.value);

    requestForm.reset();
    linkPreview.classList.add('hidden');
    selectedVideoInfo = null;
    document.getElementById('linkError').textContent = '';
}

// ===== Duplicate Modal =====
function closeDuplicateModal() {
    duplicateModal.classList.remove('show');
    pendingRequest = null;
}

async function confirmDuplicate() {
    if (!pendingRequest) return;

    try {
        const response = await fetch(`${API_BASE}/api/songs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingRequest)
        });

        if (response.ok) {
            showToast('✅ ส่งคำขอเพลงเรียบร้อยแล้ว!', 'success');
            resetForm();
            loadQueue();
        } else {
            const data = await response.json();
            showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
        }
    } catch (error) {
        showToast('เกิดข้อผิดพลาด', 'error');
    }

    closeDuplicateModal();
}

// ===== Load Queue =====
async function loadQueue() {
    try {
        const response = await fetch(`${API_BASE}/api/songs`);
        const songs = await response.json();

        renderQueue(songs);
    } catch (error) {
        console.error('Error loading queue:', error);
    }
}

function renderQueue(songs) {
    if (!songs || songs.length === 0) {
        emptyQueue.style.display = 'block';
        queueList.innerHTML = '';
        queueList.appendChild(emptyQueue);
        return;
    }

    emptyQueue.style.display = 'none';

    // Track new IDs to apply animation
    const currentIds = new Set(songs.map(s => s.id));

    queueList.innerHTML = songs.map((song, index) => {
        const info = song.videoInfo || {};
        const thumbnail = info.thumbnailMedium || info.thumbnail || 'https://via.placeholder.com/120x68?text=🎵';
        const submittedDate = new Date(song.submittedAt);
        const estimatedTime = new Date(song.estimatedPlayTime);

        // Only add animate-in class if the ID is actually new
        const isNew = !lastQueueIds.has(song.id);
        const animationClass = isNew ? 'animate-in' : '';

        return `
            <div class="queue-item ${animationClass} ${song.isDuplicate ? 'duplicate' : ''} ${song.status === 'rejected' ? 'rejected' : ''}" data-id="${song.id}">
                <div class="queue-number">${song.queueNumber}</div>
                <img src="${thumbnail}" alt="" class="queue-thumbnail" onerror="this.src='https://via.placeholder.com/120x68?text=🎵'">
                <div class="queue-info">
                    <div class="queue-title">
                        ${song.link ? `<a href="${song.link}" target="_blank">${escapeHtml(song.songName)}</a>` : escapeHtml(song.songName)}
                        ${song.isDuplicate ? '<span class="badge badge-duplicate">ซ้ำ</span>' : ''}
                        ${song.status === 'rejected' ? '<span class="badge badge-rejected">ถูกปฏิเสธ</span>' : ''}
                    </div>
                    <div class="queue-meta">
                        ${info.author ? `<span>🎤 ${escapeHtml(info.author)}</span>` : ''}
                        ${info.duration ? `<span>⏱️ ${formatDuration(info.duration)}</span>` : ''}
                        <span>📅 ${formatDate(submittedDate)}</span>
                    </div>
                    <div class="queue-requester">
                        ขอโดย: <strong>${escapeHtml(song.name)}</strong>
                    </div>
                    <div class="queue-estimate" 
                        data-seconds="${song.estimatedWaitSeconds}" 
                        data-timestamp="${Date.now()}"
                        data-time-str="${formatTime(estimatedTime)}">
                        ⏳ 
                        ${song.estimatedWaitSeconds < 60
                ? `จะเปิดในอีก ${song.estimatedWaitSeconds} วินาที (${formatTime(estimatedTime)})`
                : `จะเปิดในอีก ~${song.estimatedWaitMinutes} นาที (${formatTime(estimatedTime)})`
            }
                    </div>
                </div>
                <div class="queue-actions">
                    <div class="vote-buttons">
                        <button class="vote-btn up ${hasVoted(song.id, 'up') ? 'active' : ''}" onclick="vote('${song.id}', 'up')" title="เห็นด้วย">
                            👍 <span>${song.votes.up}</span>
                        </button>
                        <button class="vote-btn down ${hasVoted(song.id, 'down') ? 'active' : ''}" onclick="vote('${song.id}', 'down')" title="ไม่เห็นด้วย">
                            👎 <span>${song.votes.down}</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Update the set for next render
    lastQueueIds = currentIds;
}

// ===== Auto-update Wait Times =====
function updateCountdowns() {
    const estimates = document.querySelectorAll('.queue-estimate');
    estimates.forEach(el => {
        const remainingSeconds = parseInt(el.dataset.seconds);
        if (isNaN(remainingSeconds)) return;

        const now = Date.now();
        const start = parseInt(el.dataset.timestamp);
        const elapsed = Math.floor((now - start) / 1000);
        const currentRemaining = Math.max(0, remainingSeconds - elapsed);

        const estimatedTime = el.dataset.timeStr;

        if (currentRemaining < 60) {
            el.innerHTML = `⏳ จะเปิดในอีก ${currentRemaining} วินาที (${estimatedTime})`;
        } else {
            const mins = Math.ceil(currentRemaining / 60);
            el.innerHTML = `⏳ จะเปิดในอีก ~${mins} นาที (${estimatedTime})`;
        }
    });
}

// ===== Vote =====
function hasVoted(songId, type) {
    const votes = JSON.parse(localStorage.getItem('my_votes') || '{}');
    if (type) return votes[songId] === type;
    return votes[songId] !== undefined;
}

async function vote(songId, type) {
    const btn = event.currentTarget;

    if (hasVoted(songId)) {
        showToast('คุณโหวตเพลงนี้ไปแล้ว', 'info');
        return;
    }

    try {
        btn.classList.add('pending');
        const response = await fetch(`${API_BASE}/api/songs/${songId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type })
        });

        if (response.ok) {
            // Save vote to local storage
            const votes = JSON.parse(localStorage.getItem('my_votes') || '{}');
            votes[songId] = type;
            localStorage.setItem('my_votes', JSON.stringify(votes));

            loadQueue();
            showToast('✅ ขอบคุณสำหรับการโหวต!', 'success');
        } else {
            showToast('พบข้อผิดพลาดขณะโหวต', 'error');
        }
    } catch (error) {
        console.error('Vote error:', error);
    } finally {
        btn.classList.remove('pending');
    }
}

// ===== Utilities =====
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(date) {
    return date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTime(date) {
    return date.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Load History =====
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/api/history`);
        const history = await response.json();
        renderHistory(history);
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// ===== Render History =====
function renderHistory(history) {
    if (!historyList) return;

    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="text-center text-muted py-4" id="emptyHistory">
                <p>ยังไม่มีประวัติการเล่น</p>
            </div>
        `;
        return;
    }

    historyList.innerHTML = history.map((song, index) => `
        <div class="queue-item" style="opacity: 0.8; border-left: 4px solid var(--accent-primary);">
            <div class="song-info">
                <div class="song-name">${escapeHtml(song.songName)}</div>
                <div class="song-meta">
                    <span>👤 ${escapeHtml(song.name)}</span>
                    <span style="margin-left: 10px;">🕒 เล่นจบเมื่อ ${formatTime(new Date(song.playedAt))}</span>
                </div>
            </div>
            <div class="queue-actions">
                <span class="badge" style="background: rgba(0, 255, 136, 0.1); color: #00ff88; border: 1px solid #00ff88;">เล่นจบแล้ว</span>
            </div>
        </div>
    `).join('');
}
