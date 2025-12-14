/* BACKEND BASE URL (Render) */
const API_BASE = "https://nwave-backend.onrender.com"; 
// ^ replace with your exact Render backend URL

/*THEME TOGGLE - FIXED (Runs FIRST)*/
const themeBtn = document.getElementById("themeToggle");
if (themeBtn) {
  console.log('🌙 Theme toggle found');
  const KEY = "nwave-theme";
  
  const applyTheme = (theme) => {
    console.log('Applying theme:', theme);
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
    themeBtn.textContent = theme === "dark" ? "☀" : "⏾";
  };
  
  // Load saved
  const saved = localStorage.getItem(KEY);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = saved || (systemDark ? "dark" : "light");
  applyTheme(initialTheme);
  
  // Toggle click
  themeBtn.onclick = () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const nextTheme = current === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  };
}


// Player variables
let ytPlayer = null;
let audioPlayer = null;
let playerReady = false;
let currentPlayer = null;
let leftTracks = [], rightTracks = [];
let currentIndex = 0;
let activeList = 'left';
let isPlaying = false;
let searchTimeout = null;


// SINGLE DOMContentLoaded -
document.addEventListener('DOMContentLoaded', initPlayer);


function initPlayer() {
  console.log('🎵 nWave: FULLY LOADED');
  
  audioPlayer = new Audio();
  audioPlayer.preload = 'metadata';
  audioPlayer.volume = 0.7;
  
  const elements = {
    miniTitle: document.getElementById('miniTitle'),
    miniArtist: document.getElementById('miniArtist'),
    miniDisk: document.getElementById('miniDisk'),
    seekBar: document.getElementById('seekBar'),
    miniPlay: document.getElementById('miniPlay'),
    miniPrev: document.getElementById('miniPrev'),
    miniNext: document.getElementById('miniNext'),
    playlistList: document.getElementById('playlistList'),
    queueList: document.getElementById('queueList'),
    playlistSubtitle: document.getElementById('playlistSubtitle'),
    globalSearch: document.getElementById('globalSearch')
  };


  // DEV SUPPORT MODAL - PRESERVED ✅
  const devBtn = document.querySelector('.nav-pill-dev');
  const devSupport = document.getElementById('devSupport');
  const devClose = devSupport?.querySelector('.dev-close');
  const devForm = document.getElementById('devForm');


  if (devBtn) {
    devBtn.onclick = () => devSupport.classList.add('active');
  }
  if (devClose) {
    devClose.onclick = () => devSupport.classList.remove('active');
  }
  // Close when click outside
  document.addEventListener('click', (e) => {
    if (devSupport && !devSupport.contains(e.target) && !devBtn.contains(e.target)) {
      devSupport.classList.remove('active');
    }
  });


  // YouTube API
  loadYouTubeAPI();


  // Audio events
  audioPlayer.addEventListener('play', () => { if (currentPlayer === 'audio') updatePlayerState(true); });
  audioPlayer.addEventListener('pause', () => { if (currentPlayer === 'audio') updatePlayerState(false); });
  audioPlayer.addEventListener('ended', () => {
    console.log('🎵 Audio ended → Random next');
    randomTrack();
  });
  audioPlayer.addEventListener('timeupdate', updateSeekBar);


  // Load playlists
  loadInitialPlaylists();


  // 🔥 TAG FILTER → LOAD BOTH SIDES
  document.querySelectorAll(".tag-chip").forEach(btn => {
    btn.addEventListener("click", async () => {

      // UI active state
      document.querySelectorAll(".tag-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const tag = btn.dataset.filter;
      console.log("🎧 Tag selected:", tag);

      if (tag === "all") {
        loadLeftPlaylist();      // YouTube default
        loadRightPlaylist();     // Jamendo default
        return;
      }

      // Load left → YouTube tag
      loadLeftPlaylistByTag(tag);

      // Load right → Jamendo tag
      loadRightPlaylistByTag(tag);
    });
  });



  // 🔥 SEARCH → LEFT (now using backend)
  elements.globalSearch.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      if (query.length < 2) {
        loadLeftPlaylist();
        return;
      }
      console.log('🔍 Searching:', query);
      try {
        const res = await fetch(`${API_BASE}/api/left-search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        leftTracks = data.tracks;
        renderTracks(elements.playlistList, leftTracks, 'left');
        elements.playlistSubtitle.textContent = `${leftTracks.length} search results`;
      } catch (err) {
        console.error('Search failed:', err);
      }
    }, 400);
  });


  // Controls
  elements.miniPlay.onclick = togglePlayPause;
  elements.miniNext.onclick = nextTrack;
  elements.miniPrev.onclick = prevTrack;
  elements.seekBar.oninput = handleSeek;
  setInterval(updateSeekBar, 500);
}


// load youtube api
function loadYouTubeAPI() {
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(script);

  window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-player', {
      height: '1', width: '1',
      playerVars: { playsinline: 1, controls: 0 },
      events: {
        onReady: () => { 
          playerReady = true; 
          console.log('✅ YT Player Ready');
        },
        onStateChange: (e) => {
          if (currentPlayer !== 'yt') return;
          switch(e.data) {
            case 1: updatePlayerState(true); break;
            case 2: updatePlayerState(false); break;
            case 0:
              console.log('🎵 YouTube ended → Random next');
              randomTrack();
              break;
          }
        }
      }
    });
  };
}


async function loadInitialPlaylists() {
  await loadLeftPlaylist();
  await loadRightPlaylist();
  console.log('Playlists ready - Click to start!');
}


async function loadLeftPlaylist() {
  try {
    const res = await fetch(`${API_BASE}/api/left-playlist`);
    const data = await res.json();
    leftTracks = data.tracks;
    renderTracks(document.getElementById('playlistList'), leftTracks, 'left');
    document.getElementById('playlistSubtitle').textContent = `${leftTracks.length} tracks`;
  } catch (e) { console.error('Left failed', e); }
}


async function loadLeftPlaylistByTag(tag) {
  try {
    const res = await fetch(`${API_BASE}/api/left-playlist-tag?tag=${encodeURIComponent(tag)}`);
    const data = await res.json();
    leftTracks = data.tracks;
    renderTracks(document.getElementById('playlistList'), leftTracks, 'left');
    document.getElementById('playlistSubtitle').textContent = `${leftTracks.length} mood results`;
  } catch (err) {
    console.error('Left by tag failed:', err);
  }
}


async function loadRightPlaylist() {
  try {
    const res = await fetch(`${API_BASE}/api/right-playlist`);
    const data = await res.json();
    rightTracks = data.tracks;
    renderTracks(document.getElementById('queueList'), rightTracks, 'right');
  } catch (e) { console.error('Right failed', e); }
}


async function loadRightPlaylistByTag(tag) {
  try {
    const res = await fetch(`${API_BASE}/api/right-playlist-tag?tag=${encodeURIComponent(tag)}`);
    const data = await res.json();
    rightTracks = data.tracks;
    renderTracks(document.getElementById('queueList'), rightTracks, 'right');
  } catch (err) {
    console.error('Right by tag failed:', err);
  }
}



function renderTracks(container, tracks, side) {
  container.innerHTML = '';
  tracks.slice(0, 25).forEach((track, i) => {
    const row = document.createElement('div');
    row.className = side === 'right' ? 'queue-row' : 'playlist-row';
    row.innerHTML = `
      <div class="playlist-cover" style="background-image: url(${track.thumb})"></div>
      <div class="playlist-meta">
        <div class="playlist-title">${track.title}</div>
        <div class="playlist-artist">${track.artist} <span class="source-tag ${track.source}">${track.source.toUpperCase()}</span></div>
      </div>
      <div class="playlist-duration">${formatTime(track.duration)} <button class="queue-play-btn" data-index="${i}">▶</button></div>
    `;
    
    row.onclick = (e) => {
      if (e.target.classList.contains('queue-play-btn')) return;
      console.log(`SELECTED: ${track.title}`);
      activeList = side;
      currentIndex = i;
      loadTrackFromList(true);
    };
    
    container.appendChild(row);
  });
}


function loadTrackFromList(autoPlay = false) {
  const list = activeList === 'left' ? leftTracks : rightTracks;
  const track = list[currentIndex];
  if (!track) return;

  console.log(`NOW PLAYING: ${track.title} (${track.source})`);

  document.getElementById('miniTitle').textContent = track.title;
  document.getElementById('miniArtist').innerHTML = `${track.artist} <span class="source-tag ${track.source}">${track.source}</span>`;

  stopCurrentPlayer();

  if (track.source === 'youtube' && track.videoId && ytPlayer && playerReady) {
    currentPlayer = 'yt';
    ytPlayer.loadVideoById(track.videoId);
    if (autoPlay) setTimeout(() => ytPlayer.playVideo(), 1000);
  } else if (track.source === 'jamendo' && track.audioUrl && audioPlayer) {
    currentPlayer = 'audio';
    audioPlayer.src = track.audioUrl;
    if (autoPlay) {
      audioPlayer.play().catch(e => console.warn('Audio play:', e));
    }
  }
}


function stopCurrentPlayer() {
  if (currentPlayer === 'yt' && ytPlayer) ytPlayer.stopVideo();
  if (currentPlayer === 'audio' && audioPlayer) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  }
  updatePlayerState(false);
}


function updatePlayerState(playing) {
  isPlaying = playing;
  const miniPlay = document.getElementById('miniPlay');
  const miniDisk = document.getElementById('miniDisk');
  miniPlay.innerHTML = playing ? '⏸' : '▶';
  miniDisk.classList.toggle('playing', playing);
}


function togglePlayPause() {
  if (currentPlayer === 'yt' && ytPlayer && playerReady) {
    const state = ytPlayer.getPlayerState();
    if (state === 1) ytPlayer.pauseVideo();
    else ytPlayer.playVideo();
  } else if (currentPlayer === 'audio' && audioPlayer) {
    if (isPlaying) audioPlayer.pause();
    else audioPlayer.play().catch(e => console.warn(e));
  }
}


function handleSeek() {
  const seekBar = document.getElementById('seekBar');
  const progress = parseFloat(seekBar.value);
  
  if (currentPlayer === 'yt' && ytPlayer && playerReady) {
    const duration = ytPlayer.getDuration();
    if (duration) ytPlayer.seekTo(progress / 100 * duration, true);
  } else if (currentPlayer === 'audio' && audioPlayer) {
    const duration = audioPlayer.duration;
    if (duration) audioPlayer.currentTime = progress / 100 * duration;
  }
}


function updateSeekBar() {
  let duration = 0, current = 0;
  
  if (currentPlayer === 'yt' && ytPlayer && playerReady) {
    duration = ytPlayer.getDuration() || 0;
    current = ytPlayer.getCurrentTime() || 0;
  } else if (currentPlayer === 'audio' && audioPlayer) {
    duration = audioPlayer.duration || 0;
    current = audioPlayer.currentTime || 0;
  }
  
  if (duration > 0) {
    document.getElementById('seekBar').value = (current / duration) * 100;
  }
}


function nextTrack() {
  const list = activeList === 'left' ? leftTracks : rightTracks;
  currentIndex = (currentIndex + 1) % list.length;
  loadTrackFromList(true);
}


function prevTrack() {
  const list = activeList === 'left' ? leftTracks : rightTracks;
  currentIndex = currentIndex === 0 ? list.length - 1 : currentIndex - 1;
  loadTrackFromList(true);
}


// RANDOM NEXT TRACK
// FIXED RANDOM TRACK FUNCTION
function randomTrack() {
  const list = activeList === "left" ? leftTracks : rightTracks;
  if (!list.length) return;

  let randomIndex = Math.floor(Math.random() * list.length);

  // Avoid repeating the same song
  if (randomIndex === currentIndex) {
    randomIndex = (randomIndex + 1) % list.length;
  }

  currentIndex = randomIndex;
  console.log("Random next:", currentIndex);

  loadTrackFromList(true); // <-- THE REAL player loader
}


function formatTime(s) {
  return `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
}
