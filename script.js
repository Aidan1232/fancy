const audio = document.getElementById('copilot-audio');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const seekSlider = document.getElementById('seek-slider');
const trackTitle = document.getElementById('track-title');
const visualizer = document.getElementById('copilot-visualizer');
const canvasCtx = visualizer.getContext('2d');
const volumeSlider = document.getElementById('volume-slider');
const fullscreenToggle = document.getElementById('fullscreenToggle');
const hoverTime = document.getElementById('hover-time');
const seekBar = document.getElementById('seek-bar-container');

audio.volume = volumeSlider.value;
volumeSlider.oninput = () => {
    audio.volume = volumeSlider.value;
};

fullscreenToggle.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    visualizer.requestFullscreen();
  }
});

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

let fullscreenListenerAdded = false;
let visualizerFrameId = null;
async function loadTrackAsBlob(filename, displayTitle) {
  try {
    const audioPath = `ongs/${filename}`;
    audio.src = audioPath;
    audio.crossOrigin = "anonymous";
    audio.load();

    trackTitle.textContent = `🎧 Now Spinning: ${displayTitle}`;

    // 🔄 Reset previous source if needed
    if (source) {
      source.disconnect();
      fft.disconnect();
      source = null;
      fft = null;
    }

    // 🔊 Create new source + analyser
    source = analyser.createMediaElementSource(audio);
    fft = analyser.createAnalyser();
    source.connect(fft);
    fft.connect(analyser.destination);
    fft.fftSize = 128;

    const bufferLength = fft.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const peakHeights = new Array(bufferLength).fill(0);
    let edgePulseIntensity = 0;

    if (visualizerFrameId) {
        cancelAnimationFrame(visualizerFrameId);
        visualizerFrameId = null;
    }

    function renderVisualizer() {
        visualizerFrameId = requestAnimationFrame(renderVisualizer);

        if (!fft || !dataArray) return;
        fft.getByteFrequencyData(dataArray);

        canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
        canvasCtx.clearRect(0, 0, visualizer.width, visualizer.height);

        const scale = window.devicePixelRatio;
        const width = visualizer.clientWidth;
        const height = visualizer.clientHeight;

        visualizer.width = width * scale;
        visualizer.height = height * scale;
        canvasCtx.scale(scale, scale);

        const spacing = 1;
        const barCount = bufferLength;
        const barWidth = Math.floor((width - spacing * (barCount - 1)) / barCount * 1.25);

        for (let i = 0; i < barCount; i++) {
            const v = dataArray[i];
            const bias = 0.5 + Math.pow(i / barCount, 2.1);
            const asymmetryBoost = 1 + (i / barCount) * 0.1;

            const isLeftSide = i < barCount / 2;
            const leftRebalance = isLeftSide ? 1 + (1 - i / (barCount / 2)) * 0.16 : 1;

            const boosted = v * bias * asymmetryBoost * leftRebalance;
            const stretchFactor = 1 + Math.pow(v / 255, 2.2) * 0.5;
            const fullscreenBoost = isFullscreen() ? 1.9 : 0.9;
            const heightBoost = Math.max(height / 400, 1.0);
            const barHeight = Math.min(boosted * stretchFactor * fullscreenBoost * heightBoost, height - 4);

            // ⛰️ Track peaks
            if (barHeight > peakHeights[i]) {
                peakHeights[i] = barHeight;
            } else {
                peakHeights[i] -= 0.26;
                peakHeights[i] = Math.max(peakHeights[i], 0);
                peakHeights[i] = Math.min(peakHeights[i], height - 2);
            }

            // 💥 Trigger pulse only from middle bars
            const centerRange = isFullscreen() ? 0.30 : 0.23; // central 5%
            const isMiddleBar = i >= barCount * (0.5 - centerRange) && i <= barCount * (0.5 + centerRange);
            if (isMiddleBar && barHeight >= height - 4) {
                edgePulseIntensity = Math.min(1, edgePulseIntensity + 0.3);
            }

            const x = i * (barWidth + spacing);

            canvasCtx.fillStyle = `rgb(${v + 120}, 0, ${255 - v})`;
            canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);

            canvasCtx.fillStyle = '#7928ca';
            canvasCtx.fillRect(x, height - peakHeights[i], barWidth, 2);
        }

        // 🌈 Render edge pulse
        if (edgePulseIntensity > 0) {
            canvasCtx.save();
            canvasCtx.globalAlpha = edgePulseIntensity * 0.3;

            const maxGlowWidth = width * 0.4;
            const glowWidth = maxGlowWidth * edgePulseIntensity;

            const gradientLeft = canvasCtx.createLinearGradient(0, 0, glowWidth, 0);
            gradientLeft.addColorStop(0, '#7928ca');
            gradientLeft.addColorStop(1, 'rgba(255, 0, 128, 0)');

            const gradientRight = canvasCtx.createLinearGradient(width, 0, width - glowWidth, 0);
            gradientRight.addColorStop(0, '#7928ca');
            gradientRight.addColorStop(1, 'rgba(255, 0, 128, 0)');

            const gradientTop = canvasCtx.createLinearGradient(0, 0, 0, glowWidth);
            gradientTop.addColorStop(0, '#7928ca');
            gradientTop.addColorStop(1, 'rgba(255, 0, 128, 0)');

            const gradientBottom = canvasCtx.createLinearGradient(0, height, 0, height - glowWidth);
            gradientBottom.addColorStop(0, '#7928ca');
            gradientBottom.addColorStop(1, 'rgba(255, 0, 128, 0)');

            canvasCtx.fillStyle = gradientLeft;
            canvasCtx.fillRect(0, 0, glowWidth, height);

            canvasCtx.fillStyle = gradientRight;
            canvasCtx.fillRect(width - glowWidth, 0, glowWidth, height);

            canvasCtx.fillStyle = gradientTop;
            canvasCtx.fillRect(0, 0, width, glowWidth);

            canvasCtx.fillStyle = gradientBottom;
            canvasCtx.fillRect(0, height - glowWidth, width, glowWidth);

            canvasCtx.restore();
            edgePulseIntensity -= 0.02;
        }
    }

    renderVisualizer();

    if (analyser.state === "suspended") {
        await analyser.resume();
        console.log("🔊 AudioContext resumed");
    }

    if (!fullscreenListenerAdded) {
        document.addEventListener('fullscreenchange', () => {
            if (!isFullscreen() && Array.isArray(peakHeights)) {
            for (let i = 0; i < peakHeights.length; i++) {
                peakHeights[i] = 0;
            }
            }
        });
        fullscreenListenerAdded = true;
    }

    await audio.play();
  } catch (err) {
    trackTitle.textContent = `⚠️ Load failed: ${filename}`;
    console.error(err);
  }
}

function renderTrackList(tracks) {
  const trackList = document.getElementById('track-list');
  trackList.innerHTML = "";

  const grouped = {};

  tracks.forEach(filename => {
    const { artist, title, display } = formatTitle(filename);
    const firstLetter = typeof title === 'string'
      ? title.trim()[0]?.toUpperCase() || '#'
      : '#';

    if (!grouped[firstLetter]) grouped[firstLetter] = [];
    grouped[firstLetter].push({ filename, display });
  });

  Object.keys(grouped).sort().forEach(letter => {
    const header = document.createElement('h3');
    header.textContent = letter;
    header.style.marginTop = "20px";
    header.style.color = "#ff91d6";
    header.style.textShadow = "0 0 4px #ff0080";
    trackList.appendChild(header);

    grouped[letter].forEach(({ filename, display }) => {
      const li = document.createElement('li');
      li.textContent = display;
      li.onclick = () => loadTrackAsBlob(filename, display);
      trackList.appendChild(li);
    });
  });
}

let allTracks = [];

fetch('tracks.json')
  .then(res => res.json())
  .then(tracks => {
    allTracks = tracks;
    renderTrackList(allTracks);
});

document.getElementById('track-search').addEventListener('input', e => {
  const query = e.target.value.toLowerCase();

  const filtered = allTracks.filter(filename => {
    const { display } = formatTitle(filename);
    return display.toLowerCase().includes(query);
  });

  renderTrackList(filtered);
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

window.addEventListener("DOMContentLoaded", () => {
  const playBtn = document.getElementById("play-btn");
  const audio = document.getElementById('copilot-audio');

  playBtn.onclick = async () => {
    console.log("🔘 Button clicked");

    try {
      if (typeof audioCtx !== "undefined" && audioCtx.state === "suspended") {
        await audioCtx.resume();
        console.log("🔊 AudioContext resumed");
      }

      audio.volume = 1;
      audio.muted = false;

      await audio.play();
      console.log("✅ Playback started");
    } catch (err) {
      console.error("❌ Playback failed:", err);
    }
  };
});

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
    document.getElementById('time-stamp').textContent = `${current} / ${total}`;
};

seekBar.addEventListener('mousemove', (e) => {
    const rect = seekBar.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percent = offsetX / rect.width;
    const previewTime = percent * audio.duration;

    if (!isNaN(previewTime)) {
    hoverTime.textContent = formatTime(previewTime);
    const mouseX = e.clientX - rect.left + 640; // default 640 
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
let source;
let fft;

function isFullscreen() {
  return document.fullscreenElement != null;
}