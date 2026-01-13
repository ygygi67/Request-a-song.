// Minimal recovered admin.js to restore functionality
// Features: lyrics modal + next line, party toggle, volume sync, 401 auto-logout
(function(){
  'use strict';

  const getAdminKey = () => (window.adminKey || localStorage.getItem('adminKey') || '').trim();

  function showToast(message, type = 'info') {
    try {
      const container = document.getElementById('toastContainer');
      if (!container) return console.log(`[Toast:${type}]`, message);
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.textContent = message;
      container.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    } catch (e) { console.log(`[Toast:${type}]`, message); }
  }

  function handleUnauthorized(res){
    if (res && res.status === 401){
      showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'error');
      setTimeout(() => { try { localStorage.removeItem('adminKey'); location.href = '/admin.html'; } catch(_){} }, 1200);
      return true;
    }
    return false;
  }

  // ===== Volume =====
  let volumeDebounceTimer;
  window.adjustVolume = function(value){
    const v = Math.max(0, Math.min(100, parseInt(value,10) || 0));
    const volumeValueEl = document.getElementById('volumeValue');
    if (volumeValueEl) volumeValueEl.innerText = `${v}%`;
    const slider = document.getElementById('adminVolumeSlider');
    if (slider && slider.value !== String(v)) slider.value = String(v);
    const numberInput = document.getElementById('adminVolumeNumber');
    if (numberInput && numberInput.value !== String(v)) numberInput.value = String(v);

    clearTimeout(volumeDebounceTimer);
    volumeDebounceTimer = setTimeout(async ()=>{
      const key = getAdminKey();
      if (!key) return; // Do not call server before login
      try{
        const res = await fetch('/api/admin/volume',{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ adminKey: key, volume: v })
        });
        if (handleUnauthorized(res)) return;
      }catch(e){ console.error('Volume error:', e); }
    }, 400);
  };

  // Reject a specific song from queue list
  window.rejectSong = async function(songId){
    if (!songId) return;
    if (!confirm('ต้องการปฏิเสธเพลงนี้หรือไม่?')) return;
    try{
      const res = await fetch(`/api/songs/${encodeURIComponent(songId)}`,{
        method:'DELETE', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: getAdminKey() })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok){
        showToast('❌ ปฏิเสธเพลงแล้ว','success');
        loadQueue();
        loadCurrentSong();
      } else {
        const data = await res.json().catch(()=>({}));
        showToast(data.error || 'ปฏิเสธไม่สำเร็จ','error');
      }
    }catch(e){ console.error('rejectSong error:', e); }
  };

  // Toggle Cinema Mode (expand player on Player UI)
  window.toggleCinema = async function(){
    const key = getAdminKey(); if (!key) return;
    try{
      const res = await fetch('/api/admin/cinema', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: key })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok){
        showToast('🖵 สลับโหมดโรงหนังแล้ว','success');
        // fun pulse on button
        const buttons = Array.from(document.querySelectorAll('.player-controls button'));
        const btn = buttons.find(b => (b.title && b.title.includes('โหมดโรงหนัง')) || (b.textContent && b.textContent.includes('🖵')));
        if (btn){ btn.classList.add('party-pulse'); setTimeout(()=>btn.classList.remove('party-pulse'), 820); }
      } else {
        showToast('สลับโหมดโรงหนังไม่สำเร็จ','error');
      }
    }catch(e){ console.error('toggleCinema error:', e); }
  };

  // ===== Party Mode =====
  window.togglePartyMode = async function(){
    try{
      const res = await fetch('/api/admin/party',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: getAdminKey() })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok) {
        showToast('🎉 สลับโหมดปาร์ตี้แล้ว','success');
        // Party FX for fun
        ensurePartyFxStyles();
        partyFlash();
        partyPulseButton();
        partyConfettiBurst();
      } else {
        showToast('สลับโหมดปาร์ตี้ไม่สำเร็จ','error');
      }
    }catch(e){ console.error('Party error:', e); }
  };

  // ===== Party FX (Confetti / Pulse / Flash) =====
  function ensurePartyFxStyles(){
    if (document.getElementById('partyFxStyles')) return;
    const style = document.createElement('style');
    style.id = 'partyFxStyles';
    style.textContent = `
      @keyframes party-pop { from { transform: translate(0,0) scale(0.8); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(1); opacity: 0; } }
      @keyframes party-flash { from { opacity: 0.5; } to { opacity: 0; } }
      @keyframes party-pulse { 0%{ transform: scale(1);} 50%{ transform: scale(1.12);} 100%{ transform: scale(1);} }
      .party-confetti { position: fixed; top: 0; left: 0; pointer-events: none; z-index: 6000; }
      .party-piece { position: absolute; width: 10px; height: 10px; border-radius: 2px; animation: party-pop 900ms ease-out forwards; }
      .party-flash { position: fixed; inset: 0; background: radial-gradient(ellipse at center, rgba(255,255,255,0.6), rgba(255,255,255,0)); animation: party-flash 600ms ease-out forwards; pointer-events: none; z-index: 5500; }
      .party-pulse { animation: party-pulse 800ms ease-in-out; }
    `;
    document.head.appendChild(style);
  }

  function getPartyButton(){
    const buttons = Array.from(document.querySelectorAll('.player-controls button'));
    return buttons.find(b => (b.title && b.title.includes('ปาร์ตี้')) || (b.textContent && b.textContent.includes('🎉')));
  }

  function partyPulseButton(){
    const btn = getPartyButton();
    if (!btn) return;
    btn.classList.add('party-pulse');
    setTimeout(()=> btn.classList.remove('party-pulse'), 820);
  }

  function partyFlash(){
    const flash = document.createElement('div');
    flash.className = 'party-flash';
    document.body.appendChild(flash);
    setTimeout(()=> flash.remove(), 650);
  }

  function partyConfettiBurst(){
    const btn = getPartyButton();
    const rect = btn ? btn.getBoundingClientRect() : { left: window.innerWidth/2, top: 80, width: 40, height: 40 };
    const originX = rect.left + rect.width/2;
    const originY = rect.top + rect.height/2;

    const container = document.createElement('div');
    container.className = 'party-confetti';
    document.body.appendChild(container);

    const colors = ['#ff4d4d','#ffd93d','#36fba1','#4da3ff','#b76cff','#ff8ad4'];
    const pieces = 36;
    for (let i=0; i<pieces; i++){
      const piece = document.createElement('span');
      piece.className = 'party-piece';
      const angle = (Math.PI * 2) * (i/pieces) + (Math.random()*0.5-0.25);
      const distance = 80 + Math.random()*120;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      piece.style.setProperty('--dx', `${dx}px`);
      piece.style.setProperty('--dy', `${dy}px`);
      piece.style.setProperty('--rot', `${(Math.random()*720-360)}deg`);
      piece.style.left = `${originX}px`;
      piece.style.top = `${originY}px`;
      piece.style.background = colors[i % colors.length];
      container.appendChild(piece);
    }
    setTimeout(()=> container.remove(), 1100);
  }

  // ===== Lyrics =====
  function ensureLyricsModal(){
    if (document.getElementById('lyricsModal')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'lyricsModal';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>📝 ใส่เนื้อเพลง</h3>
          <button class="modal-close" onclick="closeLyricsModal()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>วาง/พิมพ์เนื้อเพลงที่นี่ (แต่ละบรรทัดเป็น 1 ท่อน)</label>
            <textarea id="lyricsTextarea" rows="10" style="width:100%; padding:10px; border-radius:8px; background: rgba(0,0,0,0.3); border:1px solid var(--border-color); color:white;"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeLyricsModal()">ยกเลิก</button>
          <button class="btn btn-primary" onclick="saveLyrics()">บันทึก</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  window.openLyricsModal = function(){ ensureLyricsModal(); const m = document.getElementById('lyricsModal'); if (m) m.classList.add('active'); };
  window.closeLyricsModal = function(){ const m = document.getElementById('lyricsModal'); if (m) m.classList.remove('active'); };

  window.saveLyrics = async function(){
    const lyrics = (document.getElementById('lyricsTextarea')?.value || '').trim();
    try{
      const res = await fetch('/api/admin/lyrics',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: getAdminKey(), lyrics, enabled: true })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok){ showToast('📝 บันทึกเนื้อเพลงแล้ว','success'); closeLyricsModal(); }
      else showToast('บันทึกเนื้อเพลงไม่สำเร็จ','error');
    }catch(e){ console.error('Save lyrics error:', e); showToast('บันทึกเนื้อเพลงไม่สำเร็จ','error'); }
  };

  window.nextLyricsLine = async function(){
    try{
      const res = await fetch('/api/admin/lyrics/next',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: getAdminKey() })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok) showToast('เลื่อนไปท่อนถัดไปแล้ว','success');
      else showToast('ไม่สามารถไปท่อนถัดไปได้','error');
    }catch(e){ console.error('Next lyric error:', e); }
  };

  window.toggleLyricsMode = async function(){
    try{
      const res = await fetch('/api/admin/lyrics',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: getAdminKey() })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok) showToast('สลับโหมดเนื้อเพลงแล้ว','success');
      else showToast('สลับโหมดเนื้อเพลงไม่สำเร็จ','error');
    }catch(e){ console.error('Lyrics toggle error:', e); }
  };

  function ensureLyricsButtons(){
    try{
      const controls = Array.from(document.querySelectorAll('.player-controls'));
      const target = controls.find(c => c.querySelector('button[onclick="toggleLyricsMode()"]'));
      if (!target) return false;
      if (!document.getElementById('btnLyricsInput')){
        const b = document.createElement('button'); b.id='btnLyricsInput'; b.className='btn btn-icon btn-secondary'; b.title='ใส่เนื้อเพลงเอง'; b.textContent='🖊️'; b.onclick = window.openLyricsModal; target.insertBefore(b, target.firstChild.nextSibling);
      }
      if (!document.getElementById('btnLyricsNext')){
        const b = document.createElement('button'); b.id='btnLyricsNext'; b.className='btn btn-icon btn-secondary'; b.title='ไปท่อน/บรรทัดถัดไปของเนื้อเพลง'; b.textContent='⏭️📝'; b.onclick = window.nextLyricsLine; target.insertBefore(b, target.firstChild.nextSibling);
      }
      ensureLyricsModal();
      return true;
    }catch(e){ return false; }
  }

  // ===== Queue Rendering (minimal) =====
  function escapeHtml(str){
    return String(str || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');
  }

  async function loadQueue(){
    try{
      const res = await fetch('/api/songs');
      const songs = await res.json();
      renderAdminQueue(Array.isArray(songs) ? songs : (songs.queue || []));
      const statQueue = document.getElementById('statQueue');
      if (statQueue) statQueue.textContent = (Array.isArray(songs) ? songs.length : (songs.queue||[]).length) || 0;
      // Update announcement text based on the next song in queue
      updateAnnouncementFromSongs(Array.isArray(songs) ? songs : (songs.queue || []));
    }catch(e){ console.error('Error loading queue:', e); }
  }

  function renderAdminQueue(songs){
    const container = document.getElementById('adminQueueList');
    const emptyEl = document.getElementById('adminEmptyQueue');
    if (!container) return;

    if (!songs || songs.length === 0){
      container.innerHTML = '';
      if (emptyEl){ emptyEl.style.display='block'; container.appendChild(emptyEl); }
      return;
    }
    if (emptyEl) emptyEl.style.display='none';

    const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='45' viewBox='0 0 80 45'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-size='20' text-anchor='middle' dy='7'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";
    container.innerHTML = songs.map((song, idx)=>{
      const info = song?.videoInfo || {};
      const tn = info.thumbnailMedium || info.thumbnail || '';
      const safeTn = (!tn || tn === 'undefined' || /\/undefined(\b|$)/.test(tn)) ? placeholder : tn;
      const votes = song?.votes || { up:0, down:0 };
      return `
        <div class="queue-item" data-id="${escapeHtml(song.id)}">
          <div class="queue-number">${escapeHtml(String(song.queueNumber ?? (idx+1)))}</div>
          <img src="${safeTn}" alt="" class="queue-thumbnail" onerror="this.src='${placeholder}'">
          <div class="queue-info">
            <div class="queue-title">${song.link ? `<a href="${escapeHtml(song.link)}" target="_blank">${escapeHtml(song.songName)}</a>` : escapeHtml(song.songName)}</div>
            <div class="queue-meta">
              ${info.author ? `<span>🎤 ${escapeHtml(info.author)}</span>` : ''}
              <span>👤 ${escapeHtml(song.name)}</span>
              <span>👍 ${votes.up} / 👎 ${votes.down}</span>
            </div>
          </div>
          <div class="queue-actions">
            <button class="btn btn-secondary btn-sm" onclick="openLyricsModal()" title="ใส่เนื้อเพลงสำหรับเพลงนี้">🖊️ เนื้อเพลง</button>
            <button class="btn btn-danger btn-sm" onclick="rejectSong('${escapeHtml(song.id)}')" title="ปฏิเสธเพลงนี้">❌ ปฏิเสธ</button>
          </div>
        </div>`;
    }).join('');
  }

  let queueTimer = null;
  function startQueueRefresh(){
    loadQueue();
    if (queueTimer) clearInterval(queueTimer);
    queueTimer = setInterval(loadQueue, 5000);
  }

  // ===== Announcement Copy Box (for MC/Host) =====
  function ensureAnnouncementBox(){
    let box = document.getElementById('announceBox');
    if (box) return box;
    const header = document.querySelector('.admin-header');
    if (!header) return null;
    box = document.createElement('div');
    box.id = 'announceBox';
    box.style.cssText = 'margin-left:auto; max-width:540px; display:flex; gap:8px; align-items:center;';
    box.innerHTML = `
      <textarea id="announceText" rows="2" style="flex:1; padding:8px; border-radius:8px; background: rgba(0,0,0,0.3); border:1px solid var(--border-color); color:white; font-family:inherit;" placeholder="ข้อความประกาศจะขึ้นอัตโนมัติเมื่อมีเพลงใหม่"></textarea>
      <button class="btn btn-secondary" id="copyAnnounceBtn">คัดลอก</button>
    `;
    header.appendChild(box);
    const btn = box.querySelector('#copyAnnounceBtn');
    btn.addEventListener('click', ()=>{
      const ta = document.getElementById('announceText');
      if (!ta) return;
      ta.select();
      try { document.execCommand('copy'); showToast('คัดลอกแล้ว', 'success'); } catch(_) {}
    });
    return box;
  }

  function updateAnnouncementFromSongs(songs){
    ensureAnnouncementBox();
    const ta = document.getElementById('announceText');
    if (!ta) return;
    if (!songs || songs.length === 0){ ta.value=''; return; }
    const first = songs[0];
    const name = first?.name || '-';
    const title = first?.songName || first?.videoInfo?.title || '-';
    const etaMin = (typeof first?.estimatedWaitMinutes === 'number') ? first.estimatedWaitMinutes : Math.ceil(Math.max(0, (new Date(first?.estimatedPlayTime)-Date.now())/60000));
    const playAt = first?.estimatedPlayTime ? new Date(first.estimatedPlayTime) : new Date(Date.now()+ (etaMin*60000));
    const hh = String(playAt.getHours()).padStart(2,'0');
    const mm = String(playAt.getMinutes()).padStart(2,'0');
    ta.value = `คุณ ${name} ได้ขอเพลง "${title}" จะเล่นในอีก ${etaMin} นาที เวลา ${hh}:${mm} น.`;
  }

  // ===== Now Playing + Next =====
  let lastNextSongId = null;
  let admDuration = 0;
  let admIsPlaying = false;
  let admStartedAt = null; // ms timestamp when started
  let admCurrentTime = 0; // seconds snapshot from server
  let nowUiTimer = null;
  async function loadCurrentSong(){
    try{
      const res = await fetch('/api/songs/current');
      const data = await res.json();

      const npTitle = document.getElementById('npTitle');
      const npArtist = document.getElementById('npArtist');
      const npThumb = document.getElementById('npThumbnail');
      const placeholderBig = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-family='Kanit' font-size='100' fill='%236366f1' text-anchor='middle' dy='30'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";

      const current = data.current;
      if (current){
        const info = current.videoInfo || {};
        if (npTitle) npTitle.textContent = current.songName || info.title || 'ไม่ทราบชื่อเพลง';
        if (npArtist) npArtist.textContent = info.author || current.name || '-';
        if (npThumb){
          const tn = info.thumbnailHigh || info.thumbnailMedium || info.thumbnail || '';
          npThumb.src = (!tn || tn === 'undefined' || /\/undefined(\b|$)/.test(tn)) ? placeholderBig : tn;
        }
        // Update duration and time state
        admDuration = Number(current.duration || info.duration || 0);
        admIsPlaying = !!data.isPlaying;
        admStartedAt = data.playbackState && data.playbackState.startedAt ? Number(data.playbackState.startedAt) : null;
        admCurrentTime = Number(data.currentTime || 0);
        updateNowTimeUI();
      } else {
        if (npTitle) npTitle.textContent = 'ไม่มีเพลงที่เล่น';
        if (npArtist) npArtist.textContent = '-';
        if (npThumb) npThumb.src = placeholderBig;
        admDuration = 0; admIsPlaying = false; admStartedAt = null; admCurrentTime = 0; updateNowTimeUI();
      }

      // Up Next
      const next = data.nextSong;
      const nextTitle = document.getElementById('nextTitle');
      const nextArtist = document.getElementById('nextArtist');
      const nextThumb = document.getElementById('nextThumbnail');
      const nextActions = document.getElementById('nextActions');
      const placeholderSmall = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='45' viewBox='0 0 80 45'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-size='20' text-anchor='middle' dy='7'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";

      if (next){
        const info2 = next.videoInfo || {};
        if (nextTitle) nextTitle.textContent = next.songName || info2.title || '';
        if (nextArtist) nextArtist.textContent = info2.author || next.name || '-';
        if (nextThumb){
          const tn2 = info2.thumbnailMedium || info2.thumbnail || '';
          nextThumb.src = (!tn2 || tn2 === 'undefined' || /\/undefined(\b|$)/.test(tn2)) ? placeholderSmall : tn2;
        }
        if (nextActions) nextActions.style.display = 'block';
        lastNextSongId = next.id || null;
      } else {
        if (nextTitle) nextTitle.textContent = 'ไม่มีเพลงถัดไป';
        if (nextArtist) nextArtist.textContent = '-';
        if (nextThumb) nextThumb.src = placeholderSmall;
        if (nextActions) nextActions.style.display = 'none';
        lastNextSongId = null;
      }

      // Update stats counters (today/total) if available
      const statToday = document.getElementById('statToday');
      const statTotal = document.getElementById('statTotalPlayed');
      if (data.stats) {
        if (statToday) statToday.textContent = data.stats.todayCount ?? 0;
        if (statTotal) statTotal.textContent = data.stats.totalPlayed ?? 0;
      }
    }catch(e){ console.error('Error loading current song:', e); }
  }

  function formatTimeMMSS(sec){
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec/60);
    const s = sec%60;
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  function updateNowTimeUI(){
    const curEl = document.getElementById('npCurrentTime');
    const durEl = document.getElementById('npDuration');
    const barFill = document.getElementById('npProgress');
    const seek = document.getElementById('seekBar');
    const nowSec = admIsPlaying && admStartedAt ? ((Date.now() - admStartedAt)/1000) : admCurrentTime;
    const clamped = Math.max(0, Math.min(admDuration || 0, nowSec));
    if (curEl) curEl.textContent = formatTimeMMSS(clamped);
    if (durEl) durEl.textContent = formatTimeMMSS(admDuration || 0);
    const pct = (admDuration > 0) ? (clamped/admDuration*100) : 0;
    if (barFill) barFill.style.width = `${pct}%`;
    if (seek) seek.value = String(Math.min(100, Math.max(0, pct)));
  }

  if (nowUiTimer) clearInterval(nowUiTimer);
  nowUiTimer = setInterval(()=>{
    if (admIsPlaying && admStartedAt){ updateNowTimeUI(); }
  }, 1000);

  window.rejectNextSong = async function(){
    if (!lastNextSongId) return;
    try{
      const res = await fetch(`/api/songs/${encodeURIComponent(lastNextSongId)}`,{
        method:'DELETE', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: getAdminKey() })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok){
        showToast('❌ ปฏิเสธเพลงถัดไปแล้ว','success');
        loadQueue();
        loadCurrentSong();
      } else {
        const data = await res.json().catch(()=>({}));
        showToast(data.error || 'ปฏิเสธไม่สำเร็จ','error');
      }
    }catch(e){ console.error('Reject next error:', e); }
  };

  let nowTimer = null;
  function startNowPlayingRefresh(){
    loadCurrentSong();
    if (nowTimer) clearInterval(nowTimer);
    nowTimer = setInterval(loadCurrentSong, 3000);
  }

  // ===== Stats =====
  async function loadStats(){
    try{
      const res = await fetch('/api/stats');
      const stats = await res.json();
      renderStats(stats || {});
    }catch(e){ console.error('Stats error:', e); }
  }

  function renderStats(stats){
    const list = document.getElementById('statsList');
    if (!list) return;
    const entries = Object.entries(stats).sort((a,b)=> b[0].localeCompare(a[0]));
    if (entries.length === 0){
      list.innerHTML = '<p class="text-center text-muted">ยังไม่มีสถิติ</p>';
      return;
    }
    list.innerHTML = entries.map(([date,count])=>{
      return `
        <div class="history-item" style="cursor:pointer" onclick="openHistoryFor('${date}')">
          <div class="history-info">
            <div class="history-title">${date}</div>
            <div class="history-meta">จำนวนที่เล่น: ${count}</div>
          </div>
        </div>`;
    }).join('');
  }

  window.openHistoryFor = function(date){
    const sel = document.getElementById('historyDateFilter');
    if (sel){ sel.value = date; }
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('active');
    // If main.js history loader is available, it will pick the date filter
    if (typeof window.loadHistory === 'function') {
      try { window.loadHistory(); } catch(_){}
    }
  };

  let statsTimer = null;
  function startStatsRefresh(){
    loadStats();
    if (statsTimer) clearInterval(statsTimer);
    statsTimer = setInterval(loadStats, 30000);
  }

  // ===== Sessions =====
  async function loadSessions(){
    const key = getAdminKey();
    if (!key) return;
    try{
      const res = await fetch(`/api/admin/sessions?adminKey=${encodeURIComponent(key)}`);
      if (handleUnauthorized(res)) return;
      const data = await res.json();
      const sessions = Array.isArray(data) ? data : (typeof data === 'object' ? Object.values(data) : []);
      renderSessions(sessions);
    }catch(e){ console.error('Sessions error:', e); }
  }

  function renderSessions(sessions){
    const container = document.getElementById('sessionsList');
    if (!container) return;
    if (!sessions || sessions.length === 0){
      container.innerHTML = '<p class="text-center text-muted">ไม่มีผู้ใช้ออนไลน์</p>';
      return;
    }
    const typeLabel = { user:'ผู้ใช้', player:'เครื่องเล่น', admin:'แอดมิน' };
    const typeColor = { user:'#eee', player:'#00ff88', admin:'#6366f1' };
    const now = Date.now();
    container.innerHTML = sessions.map(s=>{
      const last = s.lastSeen || s.lastPing || now;
      const diff = Math.max(0, Math.floor((now - new Date(last)) / 1000));
      const lastSeenText = diff < 60 ? 'เมื่อกี้' : (diff < 3600 ? `${Math.floor(diff/60)} นาที` : `${Math.floor(diff/3600)} ชม.`);
      return `
        <div class="queue-item">
          <div class="song-info">
            <div class="song-name" style="color:${typeColor[s.type]||'#fff'};">${typeLabel[s.type]||s.type||''}</div>
            <div class="song-meta">
              <span>📍 ${escapeHtml(s.ip||'-')}</span>
              <span style="margin-left:10px;">👤 ${escapeHtml(s.name||'-')}</span>
            </div>
          </div>
          <div class="queue-actions">
            <span class="badge" style="background: rgba(0,255,136,0.1); color:#00ff88; border:1px solid #00ff88;">${lastSeenText}</span>
          </div>
        </div>`;
    }).join('');
  }

  let sessionTimer = null;
  function startSessionsRefresh(){
    loadSessions();
    if (sessionTimer) clearInterval(sessionTimer);
    sessionTimer = setInterval(loadSessions, 10000);
  }

  // ===== Playback Controls =====
  async function fetchCurrentState(){
    try{ const r = await fetch('/api/songs/current'); return await r.json(); }catch{ return {}; }
  }

  window.togglePlay = async function(){
    const key = getAdminKey(); if (!key) return;
    try{
      const state = await fetchCurrentState();
      const isPlaying = !!state.isPlaying;
      const action = isPlaying ? 'pause' : 'play';
      const res = await fetch('/api/playback',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: key, action })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok){
        showToast(action === 'play' ? '▶️ กำลังเล่น' : '⏸️ หยุดชั่วคราว','success');
        loadCurrentSong();
        loadQueue();
      } else {
        showToast('เกิดข้อผิดพลาด', 'error');
      }
    }catch(e){ console.error('togglePlay error:', e); }
  };

  window.skipSong = async function(){
    const key = getAdminKey(); if (!key) return;
    try{
      const res = await fetch('/api/songs/skip',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: key })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok){
        showToast('⏭️ ข้ามเพลง','success');
        loadCurrentSong();
        loadQueue();
      } else {
        showToast('ข้ามเพลงไม่สำเร็จ','error');
      }
    }catch(e){ console.error('skipSong error:', e); }
  };

  window.toggleRepeat = async function(){
    const key = getAdminKey(); if (!key) return;
    try{
      const state = await fetchCurrentState();
      const currently = !!(state.playbackState && state.playbackState.isRepeat);
      const res = await fetch('/api/playback/repeat',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: key, enabled: !currently })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok){
        showToast(!currently ? '🔁 เปิดโหมดวนซ้ำ' : '➡️ ปิดโหมดวนซ้ำ','success');
      }
    }catch(e){ console.error('toggleRepeat error:', e); }
  };

  window.adjustTime = async function(delta){
    const key = getAdminKey(); if (!key) return;
    try{
      const state = await fetchCurrentState();
      const base = Number(state.currentTime || 0);
      const target = Math.max(0, base + Number(delta||0));
      const res = await fetch('/api/playback/seek',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: key, time: target })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok) showToast('⏩ ปรับเวลาเล่น','success');
    }catch(e){ console.error('adjustTime error:', e); }
  };

  // Seek bar handler (0-100 percent)
  window.handleSeek = async function(percent){
    const key = getAdminKey(); if (!key) return;
    const p = Math.max(0, Math.min(100, parseFloat(percent)||0));
    const duration = admDuration || 0;
    const time = duration > 0 ? (p/100)*duration : 0;
    try{
      const res = await fetch('/api/playback/seek',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ adminKey: key, time: Math.floor(time) })
      });
      if (handleUnauthorized(res)) return;
      if (res.ok){
        admCurrentTime = time; admStartedAt = Date.now(); admIsPlaying = true;
        updateNowTimeUI();
      }
    }catch(e){ console.error('handleSeek error:', e); }
  }

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', ()=>{
    const t = setInterval(()=>{ if (ensureLyricsButtons()) clearInterval(t); }, 500);
    const s = document.getElementById('adminVolumeSlider');
    const n = document.getElementById('adminVolumeNumber');
    const initV = s ? s.value : (n ? n.value : '100');
    // Only sync UI, do not POST before login
    const volumeValueEl = document.getElementById('volumeValue');
    if (volumeValueEl) volumeValueEl.innerText = `${Math.max(0, Math.min(100, parseInt(initV,10) || 100))}%`;
    if (n && s) n.value = String(s.value);

    // Start read-only refreshers even before login
    startNowPlayingRefresh();
    startStatsRefresh();
    startQueueRefresh();

    // Minimal login handling to set adminKey and reveal dashboard
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const pw = (document.getElementById('passwordInput')?.value || '').trim();
        if (!pw) return;
        try { localStorage.setItem('adminKey', pw); window.adminKey = pw; } catch(_) {}
        const loginScreen = document.getElementById('loginScreen');
        const adminDashboard = document.getElementById('adminDashboard');
        if (loginScreen) loginScreen.classList.add('hidden');
        if (adminDashboard) adminDashboard.classList.remove('hidden');
        showToast('เข้าสู่ระบบแล้ว', 'success');
        ensureLyricsButtons();
        ensureAnnouncementBox();
        // Now it's safe to POST volume once
        if (s) window.adjustVolume(s.value);
        startQueueRefresh();
        startNowPlayingRefresh();
        startStatsRefresh();
        startSessionsRefresh();
      });
    }

    // Auto-show dashboard if key already exists
    const existingKey = getAdminKey();
    if (existingKey) {
      const loginScreen = document.getElementById('loginScreen');
      const adminDashboard = document.getElementById('adminDashboard');
      if (loginScreen) loginScreen.classList.add('hidden');
      if (adminDashboard) adminDashboard.classList.remove('hidden');
      ensureLyricsButtons();
      ensureAnnouncementBox();
      if (s) window.adjustVolume(s.value);
      startQueueRefresh();
      startNowPlayingRefresh();
      startStatsRefresh();
      startSessionsRefresh();
    }

    // Sanitize undefined image src to avoid 404 /undefined
    const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='68' viewBox='0 0 120 68'%3E%3Crect width='100%25' height='100%25' fill='%231a1a2e'/%3E%3Ctext x='50%25' y='50%25' font-size='20' text-anchor='middle' dy='7'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";
    function fixInvalidSrc(img){
      if (!img) return;
      const src = img.getAttribute('src');
      if (!src || src === 'undefined' || /\/undefined(\b|$)/.test(src)) {
        img.setAttribute('src', placeholder);
      }
    }
    document.addEventListener('error', (e)=>{
      const t = e.target;
      if (t && t.tagName === 'IMG') fixInvalidSrc(t);
    }, true);
    document.querySelectorAll('img').forEach(fixInvalidSrc);
  });

// History modal open/close handlers
window.openHistory = function(){
  const m = document.getElementById('historyModal');
  if (m) m.classList.add('active');
};
window.closeHistory = function(){
  const m = document.getElementById('historyModal');
  if (m) m.classList.remove('active');
};

// Logout handler (global)
window.logout = function(){
  try { localStorage.removeItem('adminKey'); delete window.adminKey; } catch(_) {}
  const loginScreen = document.getElementById('loginScreen');
  const adminDashboard = document.getElementById('adminDashboard');
  if (adminDashboard) adminDashboard.classList.add('hidden');
  if (loginScreen) loginScreen.classList.remove('hidden');
  try { showToast('ออกจากระบบแล้ว', 'success'); } catch(_) {}
};

// Safety guards to avoid ReferenceError from inline onclick before JS loads
window.togglePlay = window.togglePlay || function(){ console.warn('togglePlay not ready'); };
window.skipSong = window.skipSong || function(){ console.warn('skipSong not ready'); };
window.toggleRepeat = window.toggleRepeat || function(){ console.warn('toggleRepeat not ready'); };
window.adjustTime = window.adjustTime || function(){ console.warn('adjustTime not ready'); };
window.toggleCinema = window.toggleCinema || function(){ console.warn('toggleCinema not ready'); };
window.rejectSong = window.rejectSong || function(){ console.warn('rejectSong not ready'); };
window.ensureAnnouncementBox = window.ensureAnnouncementBox || function(){ console.warn('ensureAnnouncementBox not ready'); };

})();
