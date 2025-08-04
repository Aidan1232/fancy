const audio = document.getElementById('copilot-audio');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const seekSlider = document.getElementById('seek-slider');
const trackTitle = document.getElementById('track-title');
const visualizer = document.getElementById('copilot-visualizer');
const canvasCtx = visualizer.getContext('2d');
const volumeSlider = document.getElementById('volume-slider');

audio.volume = volumeSlider.value;
volumeSlider.oninput = () => {
    audio.volume = volumeSlider.value;
};


function formatTitle(filename) {
    const raw = filename.replace('.mp3', '').trim();
    const parts = raw.split('-');

    if (parts.length < 2) {
    // fallback if no dash or malformed
    return {
        title: raw.replace(/_/g, ' ').trim(),
        artist: "Unknown Artist",
        display: `${raw.replace(/_/g, ' ').trim()} — Unknown Artist`
    };
    }

    const artist = parts[0].replace(/_/g, ' ').trim();
    const title = parts.slice(1).join('-').replace(/_/g, ' ').trim(); // handles multiple dashes

    return {
    artist,
    title,
    display: `${title} — ${artist}`
    };
}

async function loadTrackAsBlob(filename, displayTitle) {
  try {
    const res = await fetch(`ongs/${filename}`);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

    const blob = await res.blob();
    const blobURL = URL.createObjectURL(blob);

    audio.src = blobURL;
    audio.crossOrigin = "anonymous"; // good practice even with blob
    audio.load();
    trackTitle.textContent = `🎧 Now Spinning: ${displayTitle}`;
    audio.play();

    // Optional: store blobURL for future cleanup
    if (window.currentBlobURL) URL.revokeObjectURL(window.currentBlobURL);
    window.currentBlobURL = blobURL;
  } catch (err) {
    trackTitle.textContent = `⚠️ Load failed: ${filename}`;
    console.error(err);
  }
}

fetch('tracks.json')
    .then(res => res.json())
    .then(tracks => {
    const trackList = document.getElementById('track-list');
    trackList.innerHTML = "";

    // Group tracks by first letter
    const grouped = {};
    tracks.forEach(filename => {
        const { artist, title, display } = formatTitle(filename);

        const firstLetter = typeof title === 'string'
        ? title.trim()[0]?.toUpperCase() || '#'
        : '#'; // fallback for safety

        if (!grouped[firstLetter]) grouped[firstLetter] = [];
        grouped[firstLetter].push({ filename, display });
    });

    // Render groups alphabetically
    Object.keys(grouped).sort().forEach(letter => {
        const header = document.createElement('h3');
        header.textContent = letter;
        header.style.marginTop = "20px";
        header.style.color = "#ff91d6";
        header.style.textShadow = "0 0 4px #ff0080";
        trackList.appendChild(header);

        grouped[letter].forEach(({ filename, display }) => {
            const li = document.createElement('li');
            li.textContent = display; // This shows "Song Name — Artist"
            li.onclick = () => loadTrackAsBlob(filename, display);
            trackList.appendChild(li);
        });
    });
});

function scrollUpQuickly(duration = 300) {
    const start = window.scrollY;
    const startTime = performance.now();

    function scrollStep(timestamp) {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); // Cubic easing out

        window.scrollTo(0, start * (1 - ease));

        if (progress < 1) requestAnimationFrame(scrollStep);
    }
    requestAnimationFrame(scrollStep);
}

document.addEventListener("click", e => {
    const li = e.target.closest("li");
    if (li) {
        scrollUpQuickly(200); // adjust duration to taste
    }
});

playBtn.onclick = () => {
    audio.play();
    const rawName = audio.src.split('/').pop().replace('.mp3', '');
    const cleanedName = rawName.replace(/_/g, ' ').replace(/-/g, ' - ');
    const [artist, title] = cleanedName.split(' - ').map(s => s.trim());

    const displayName = `🎧 Now Spinning: ${title} — ${artist}`;
    trackTitle.textContent = displayName;
};

pauseBtn.onclick = () => {
    audio.pause();
    trackTitle.textContent = "🛑 Music in stasis!";
};

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const seekFill = document.getElementById('seek-bar-fill');

audio.ontimeupdate = () => {
    const percent = (audio.currentTime / audio.duration) * 100;
    seekFill.style.width = `${percent}%`;

    const current = formatTime(audio.currentTime);
    const total = formatTime(audio.duration);
    document.getElementById('time-stamp').textContent = `⏱️ ${current} / ${total}`;
};

const hoverTime = document.getElementById('hover-time');
const seekBar = document.getElementById('seek-bar-container');

seekBar.addEventListener('mousemove', (e) => {
    const rect = seekBar.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percent = offsetX / rect.width;
    const previewTime = percent * audio.duration;

    if (!isNaN(previewTime)) {
    hoverTime.textContent = formatTime(previewTime);
    const mouseX = e.clientX - rect.left + 640;
    hoverTime.style.left = `${mouseX}px`;
    hoverTime.style.display = 'block';
    }
});

seekBar.addEventListener('mouseleave', () => {
    hoverTime.style.display = 'none';
});

seekBar.addEventListener('click', (e) => {
    const rect = seekBar.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percent = offsetX / rect.width;
    audio.currentTime = percent * audio.duration;
});

// 🎵 Enhanced Visualizer with Floating Peaks
const analyser = new (window.AudioContext || window.webkitAudioContext)();

audio.addEventListener('canplaythrough', () => {
    const source = analyser.createMediaElementSource(audio);
    const fft = analyser.createAnalyser();
    source.connect(fft);
    fft.connect(analyser.destination);
    fft.fftSize = 128;

    const bufferLength = fft.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Track peaks for floating bars
    const peakHeights = new Array(bufferLength).fill(0);

    function renderVisualizer() {
        requestAnimationFrame(renderVisualizer);
        fft.getByteFrequencyData(dataArray);
        canvasCtx.clearRect(0, 0, visualizer.width, visualizer.height);

        dataArray.forEach((v, i) => {
            // 🌀 Bias toward highs + asymmetry lift
            const bias = 0.5 + Math.pow(i / bufferLength, 2.1);
            const asymmetryBoost = 1 + (i / bufferLength) * 0.1; // softened slightly
            const boosted = v * bias * asymmetryBoost;

            // 📈 Dynamic stretch curve: sensitive at peak, softer down low
            const stretchFactor = 1 + Math.pow(v / 255, 2.2) * 0.5;
            const barHeight = Math.min(boosted * stretchFactor, visualizer.height - 4); // slight cushion

            // 🎚️ Update floating peak bar
            if (barHeight > peakHeights[i]) {
                peakHeights[i] = barHeight;
            } else {
                peakHeights[i] -= 0.26; // decay speed
                peakHeights[i] = Math.max(peakHeights[i], 0);
            }

            const x = i * (visualizer.width / bufferLength);
            const barWidth = visualizer.width / bufferLength - 2;

            // 🎨 Main bar
            canvasCtx.fillStyle = `rgb(${v + 120}, 0, ${255 - v})`;
            canvasCtx.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);

            // 🌟 Floating peak bar
            canvasCtx.fillStyle = 'white';
            canvasCtx.fillRect(x, visualizer.height - peakHeights[i], barWidth, 2);
        });
    }
    renderVisualizer(); 
});