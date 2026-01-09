// ===== Player State =====
let currentSong = null;
let isPlaying = false;
let lastQueueIds = new Set(); // Track songs for "new item" animation
let tubePlayer = null;
let lastUpdateTimestamp = 0;
let serverCurrentTime = 0;
let songDuration = 0;
let alertTimer = null; // Timer for hiding new song alert

// ===== DOM Elements =====
const nowPlaying = document.getElementById('nowPlaying');
const idleMessage = document.getElementById('idleMessage');
const miniQueue = document.getElementById('miniQueue');
const progressBarFill = document.getElementById('npProgress');
const currentTimeEl = document.getElementById('npCurrentTime');
const durationEl = document.getElementById('npDuration');

// ===== YouTube API =====
function onYouTubeIframeAPIReady() {
    tubePlayer = new YT.Player('youtubePlayer', {
        height: '360',
        width: '640',
        videoId: '',
        playerVars: {
            'autoplay': 1,
            'controls': 0,
            'disablekb': 1,
            'fs': 0,
            'modestbranding': 1,
            'rel': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    console.log('YouTube Player Ready');
    loadData();
}

function onPlayerStateChange(event) {
    const videoWrapper = document.getElementById('videoWrapper');

    // YT.PlayerState.ENDED = 0
    if (event.data === YT.PlayerState.ENDED) {
        console.log('Video ended, skipping to next...');
        if (videoWrapper) videoWrapper.classList.remove('active');
        skipToNext();
    }
    // YT.PlayerState.CUED = 5 - This happens when video is loaded but not started
    else if (event.data === 5 && isPlaying) {
        console.log('Video cued, starting playback...');
        if (videoWrapper) videoWrapper.classList.add('active');
        tubePlayer.playVideo();
    }
}

function onPlayerError(e) {
    console.error('YouTube Player Error:', e);
    // Try to skip if video blocked
    setTimeout(skipToNext, 2000);
}

async function skipToNext() {
    try {
        console.log('Switching to next song...');
        const response = await fetch('/api/songs/next', {
            method: 'POST'
        });
        if (response.ok) {
            const data = await response.json();
            loadData(); // Force refresh after skip
        }
    } catch (e) {
        console.error('Skip failed:', e);
    }
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    // If API already loaded (sometimes happens with async script)
    if (window.YT && window.YT.Player) {
        onYouTubeIframeAPIReady();
    }

    // Fetch data from server every 3 seconds
    setInterval(loadData, 3000);

    // Smooth UI update every 100ms
    setInterval(updateUIProgress, 100);
});

// ===== Load Data =====
async function loadData() {
    try {
        const [currentRes, queueRes] = await Promise.all([
            fetch('/api/songs/current'),
            fetch('/api/songs')
        ]);

        const currentData = await currentRes.json();
        const queueData = await queueRes.json();

        const newSong = currentData.current;
        const newIsPlaying = currentData.isPlaying;
        const videoWrapper = document.getElementById('videoWrapper');

        // Handle song logic
        if (newSong) {
            // New song or resuming
            if (!currentSong || newSong.id !== currentSong.id) {
                currentSong = newSong;
                songDuration = currentSong.duration || 180;

                if (tubePlayer && tubePlayer.loadVideoById && currentSong.videoInfo?.videoId) {
                    tubePlayer.loadVideoById({
                        videoId: currentSong.videoInfo.videoId,
                        startSeconds: currentData.currentTime || 0,
                        suggestedQuality: 'hd1080'
                    });
                    if (tubePlayer.setVolume) tubePlayer.setVolume(100);
                }
            } else {
                // If song is the same, check for drastic time offset (seeking)
                if (tubePlayer && tubePlayer.getCurrentTime && newIsPlaying) {
                    const playerTime = tubePlayer.getCurrentTime();
                    const offset = Math.abs(playerTime - (currentData.currentTime || 0));

                    // If more than 1 second off, sync it (admin jumped)
                    if (offset > 1) {
                        console.log('Seeking to match server time:', currentData.currentTime);
                        tubePlayer.seekTo(currentData.currentTime, true);
                    }
                }
            }

            // Cinema Mode Logic
            if (currentData.playbackState && currentData.playbackState.cinemaMode) {
                document.body.classList.add('cinema-mode');
            } else {
                document.body.classList.remove('cinema-mode');
            }

            // Sync Volume
            if (tubePlayer && tubePlayer.setVolume && currentData.playbackState && currentData.playbackState.volume !== undefined) {
                const currentVolume = tubePlayer.getVolume();
                const targetVolume = currentData.playbackState.volume;
                // Only set if diff > 1 to avoid jitter
                if (Math.abs(currentVolume - targetVolume) > 1) {
                    tubePlayer.setVolume(targetVolume);
                }
            }


            // Sync Play/Pause and Visibility
            if (tubePlayer && tubePlayer.getPlayerState) {
                const playerState = tubePlayer.getPlayerState();

                if (newIsPlaying) {
                    if (playerState === YT.PlayerState.PAUSED || playerState === YT.PlayerState.CUED) {
                        tubePlayer.playVideo();
                    }
                    if (videoWrapper) videoWrapper.classList.add('active');
                } else {
                    if (playerState === YT.PlayerState.PLAYING) {
                        tubePlayer.pauseVideo();
                    }
                    // Hide when paused to satisfy user request "hide when not playing"
                    if (videoWrapper) videoWrapper.classList.remove('active');
                }
            }
        } else {
            // No song playing
            currentSong = null;
            if (videoWrapper) videoWrapper.classList.remove('active');
            if (tubePlayer && tubePlayer.stopVideo) tubePlayer.stopVideo();
        }

        isPlaying = newIsPlaying;
        serverCurrentTime = currentData.currentTime || 0;
        lastUpdateTimestamp = Date.now();

        updateUIDisplay(currentData, queueData);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// ===== Update UI =====
function updateUIDisplay(currentData, queueData) {
    const song = currentData.current;

    // Toggle now playing/idle screen
    if (!song) {
        nowPlaying.classList.add('hidden');
        document.getElementById('currentInfoBox').style.display = 'none'; // Hide and reflow
        idleMessage.classList.remove('hidden');
        renderMiniQueue(queueData); // Ensure queue is still rendered!
        return;
    }

    nowPlaying.classList.remove('hidden');
    document.getElementById('currentInfoBox').style.display = 'block'; // Show back
    idleMessage.classList.add('hidden');

    // Update main info
    const info = song.videoInfo || {};
    const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'%3E%3Crect width='100%25' height='100%25' fill='%230f0f19'/%3E%3Ctext x='50%25' y='50%25' font-family='Kanit' font-size='120' fill='%236366f1' text-anchor='middle' dy='40'%3E🎵%3C/text%3E%3C/svg%3E";

    const thumbnail = info.thumbnail || placeholder;
    document.getElementById('npThumbnail').src = thumbnail;
    document.getElementById('npBgBlur').src = thumbnail;
    document.getElementById('npTitle').textContent = song.songName;
    document.getElementById('npArtist').textContent = info.author || '-';
    document.getElementById('requesterName').textContent = song.name || '-';

    renderMiniQueue(queueData);
}

function updateUIProgress() {
    if (!currentSong || !isPlaying) return;

    // Use player's own time if available, otherwise interpolate
    let currentTime = serverCurrentTime;
    if (tubePlayer && tubePlayer.getCurrentTime) {
        const playerTime = tubePlayer.getCurrentTime();
        if (playerTime > 0) currentTime = playerTime;
    } else {
        const elapsed = (Date.now() - lastUpdateTimestamp) / 1000;
        currentTime = Math.min(serverCurrentTime + elapsed, songDuration);
    }

    const progress = (currentTime / songDuration) * 100;
    const remaining = Math.max(0, songDuration - currentTime);

    progressBarFill.style.width = progress + '%';
    currentTimeEl.textContent = formatDuration(currentTime);
    durationEl.textContent = '-' + formatDuration(remaining);
}

function renderMiniQueue(songs) {
    const queueHeader = document.getElementById('queueHeaderTitle');
    if (queueHeader) {
        queueHeader.textContent = `🎶 เพลงถัดไป (${songs.length} เพลง)`;
    }

    if (!songs || songs.length === 0) {
        miniQueue.innerHTML = '<div class="text-center text-muted" style="padding: 1rem;">ไม่มีเพลงในคิว</div>';
        lastQueueIds.clear();
        return;
    }

    const currentIds = new Set(songs.map(s => s.id));

    // If it's the very first render, don't animate everything. Just mark them as known.
    const isFirstRender = lastQueueIds.size === 0;

    songs.forEach(song => {
        // Detect NEW song added to queue (not on first render)
        if (!isFirstRender && !lastQueueIds.has(song.id)) {
            showNewSongAlert(song);
        }
    });

    miniQueue.innerHTML = songs.map((song, index) => {
        const info = song.videoInfo || {};
        const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='270' viewBox='0 0 480 270'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-size='100' text-anchor='middle' dy='35'%3E🎵%3C/text%3E%3C/svg%3E";
        const thumbnail = info.thumbnailMedium || info.thumbnail || placeholder;

        // Only animate if it's a new song AND not the very first time the page loads
        const isNew = !isFirstRender && !lastQueueIds.has(song.id);
        const animationStyle = isNew ? 'animation: itemSlideIn 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards, itemFlash 1.5s ease-out;' : '';

        return `
            <div class="mini-queue-item" style="${animationStyle}">
                <div class="queue-badge">${index + 1}</div>
                <div class="mini-queue-thumb-wrapper">
                    <img src="${thumbnail}" alt="" class="mini-queue-thumb" onerror="this.src='${placeholder}'">
                </div>
                <div class="mini-queue-title">${escapeHtml(song.songName)}</div>
                <div class="mini-queue-artist">👤 ${escapeHtml(song.name)}</div>
            </div>
        `;
    }).join('');

    lastQueueIds = currentIds;
}

function showNewSongAlert(song) {
    const alertOverlay = document.getElementById('newSongAlert');
    const alertRequester = document.getElementById('alertRequester');
    const alertSongName = document.getElementById('alertSongName');
    const infoCard = document.getElementById('currentInfoBox');

    if (!alertOverlay || !alertRequester || !alertSongName || !infoCard) return;

    // Set content
    alertRequester.textContent = `คุณ ${song.name || 'ไม่ระบุชื่อ'}`;
    alertSongName.textContent = song.songName;

    // Show alert and fade background content
    alertOverlay.classList.add('active');
    infoCard.classList.add('alert-active');

    // Clear existing timer if any (Override)
    if (alertTimer) clearTimeout(alertTimer);

    // Set timer to hide after 10 seconds
    alertTimer = setTimeout(() => {
        alertOverlay.classList.remove('active');
        infoCard.classList.remove('alert-active');
        alertTimer = null;
    }, 10000);
}

// ===== Utilities =====
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')} `;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Invisible Control: Double Click to Fullscreen =====
document.addEventListener('dblclick', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(e => console.error(e));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
});
