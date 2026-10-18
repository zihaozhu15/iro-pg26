/* Synchronized result videos: the first view is the clock and the others follow it. */
(() => {
  const container = document.querySelector('#result-examples');
  const examples = window.RESULTS_DATA;
  if (!container || !examples) return;

  const STEPS = 1000;
  // Followers within this offset play normally; larger offsets are nudged with
  // playbackRate, and anything beyond HARD_SYNC jumps straight to the clock.
  const TOLERANCE = 0.03;
  const HARD_SYNC = 0.3;
  const MAX_RATE_CHANGE = 0.08;
  const PAIRED = ['blender', 'optimization'];
  const time = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const view = (example, track) => `
    <figure>
      <figcaption>${track.label}</figcaption>
      <div class="result-frame">
        <video muted playsinline preload="none" disablepictureinpicture data-poster="${track.poster}"
          width="${example.width}" height="${example.height}" aria-label="${example.title}: ${track.label.toLowerCase()} view">
          <source src="${track.video}" type="video/mp4; codecs=avc1.640028">
          <source src="${track.webm}" type="video/webm; codecs=vp9">
        </video>
      </div>
    </figure>`;

  class SyncedPlayer {
    constructor(example) {
      this.example = example;
      this.duration = example.duration;
      this.playing = false;
      this.loop = 0;
      const paired = example.tracks.filter((track) => PAIRED.includes(track.key));
      const extra = example.tracks.filter((track) => !PAIRED.includes(track.key));
      this.row = document.createElement('article');
      this.row.className = 'result-example';
      if (example.layout === 'start-above') this.row.classList.add('result-example--landscape');
      this.row.setAttribute('aria-labelledby', `result-title-${example.id}`);
      this.row.style.setProperty('--result-ratio', `${example.width} / ${example.height}`);
      this.row.innerHTML = `
        <header class="result-heading">
          <span class="result-number">${Number(example.id)}</span>
          <h3 id="result-title-${example.id}">${example.title}</h3>
        </header>
        <div class="result-layout">
          <figure class="result-start">
            <figcaption>Start</figcaption>
            <div class="result-image-stack">
              ${example.starts.map((url, index) => `<img src="${url}" loading="lazy" decoding="async" width="${example.width}" height="${example.height}" alt="${index === 0 ? `${example.title}: initial pose with contour strokes` : ''}" ${index > 0 ? 'aria-hidden="true"' : ''}>`).join('')}
            </div>
            <p class="result-legend"><span class="legend-initial">Initial contour</span><span class="legend-target">Target stroke</span></p>
          </figure>
          ${extra.map((track) => view(example, track)).join('')}
          <div class="result-playback" role="group" aria-label="${example.title}: synchronized views">
            <div class="result-views">${paired.map((track) => view(example, track)).join('')}</div>
            <div class="result-controls">
              <button class="result-toggle" type="button" aria-label="Play ${example.title}"><span aria-hidden="true">▶</span><span class="toggle-text">Play</span></button>
              <input type="range" min="0" max="${STEPS}" step="1" value="0" aria-label="${example.title}: synchronized progress" aria-valuetext="Start">
              <output class="result-time">0:00 / ${time(this.duration)}</output>
            </div>
            <p class="result-status" role="status" aria-live="polite"></p>
          </div>
        </div>
        <p class="result-credit">Character model © ${example.copyrightHolder}</p>`;
      container.append(this.row);

      // Order videos as in the data so the first track is always the clock.
      const byKey = new Map([...this.row.querySelectorAll('video')].map((video, i) =>
        [[...extra, ...paired][i].key, video]));
      this.videos = example.tracks.map((track) => byKey.get(track.key));
      [this.clock, ...this.followers] = this.videos;
      this.button = this.row.querySelector('.result-toggle');
      this.slider = this.row.querySelector('input');
      this.output = this.row.querySelector('output');
      this.status = this.row.querySelector('.result-status');

      this.button.addEventListener('click', () => this.playing ? this.pause() : this.play());
      this.slider.addEventListener('input', () => this.seek(Number(this.slider.value) / STEPS * this.duration));
      this.clock.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(this.clock.duration)) this.duration = this.clock.duration;
        this.render();
      });
      this.clock.addEventListener('ended', () => this.finish());
      this.videos.forEach((video) => {
        // A stalled view holds the others so no view runs ahead while buffering.
        video.addEventListener('waiting', () => this.stall());
        video.addEventListener('canplay', () => this.resume());
        video.addEventListener('seeked', () => { if (!this.playing) this.render(); });
        // A failed <source> falls through to the next one; only the last source or a decode error is fatal.
        video.addEventListener('error', () => this.fail());
        video.querySelector('source:last-of-type').addEventListener('error', () => this.fail());
      });
    }

    load() {
      this.videos.forEach((video) => {
        if (video.preload === 'auto') return;
        // Posters are not lazy-loaded by the browser, so they are attached here too.
        video.poster = video.dataset.poster;
        video.preload = 'auto';
        // Some browsers do not resume resource selection after preload="none" changes.
        if (video.readyState === HTMLMediaElement.HAVE_NOTHING) video.load();
      });
    }

    ready() {
      return this.videos.every((video) => video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA);
    }

    async play() {
      this.load();
      this.videos.forEach((video) => {
        if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) video.load();
      });
      this.playing = true;
      this.updateButton();
      if (this.clock.ended || this.clock.currentTime >= this.duration - 0.05) this.align(0);
      await this.resume();
    }

    // Start (or restart after buffering) every view from the clock's time.
    async resume() {
      if (!this.playing || !this.ready()) {
        if (this.playing) this.showLoading();
        return;
      }
      if (this.videos.every((video) => !video.paused)) return;
      clearTimeout(this.loading);
      this.status.textContent = '';
      this.align(this.clock.currentTime);
      try {
        await Promise.all(this.videos.map((video) => video.play()));
        this.tick(++this.loop);
      } catch (error) {
        if (error.name !== 'AbortError') this.fail();
      }
    }

    stall() {
      if (!this.playing) return;
      this.videos.forEach((video) => video.pause());
      this.showLoading();
    }

    showLoading() {
      clearTimeout(this.loading);
      this.loading = setTimeout(() => {
        if (this.playing && !this.ready()) this.status.textContent = 'Loading video…';
      }, 300);
    }

    pause() {
      this.playing = false;
      clearTimeout(this.loading);
      this.videos.forEach((video) => video.pause());
      this.align(this.clock.currentTime);
      this.updateButton();
      this.render();
    }

    finish() {
      this.pause();
      this.align(this.duration);
      this.render(this.duration);
    }

    seek(seconds) {
      this.load();
      this.playing = false;
      this.videos.forEach((video) => video.pause());
      this.align(seconds);
      this.updateButton();
      this.render(seconds);
    }

    align(seconds) {
      this.videos.forEach((video) => {
        video.playbackRate = 1;
        if (Math.abs(video.currentTime - seconds) > 0.001) video.currentTime = seconds;
      });
    }

    // Each displayed clock frame, steer the followers toward it.
    tick(loop) {
      // Frame callbacks left over from before a pause must not start a second loop.
      if (loop !== this.loop || !this.playing || this.clock.paused) return;
      const now = this.clock.currentTime;
      this.followers.forEach((video) => {
        if (video.paused || video.seeking) return;
        const offset = video.currentTime - now;
        if (Math.abs(offset) > HARD_SYNC) video.currentTime = now;
        else video.playbackRate = Math.abs(offset) < TOLERANCE ? 1 : clamp(1 - offset * 2, 1 - MAX_RATE_CHANGE, 1 + MAX_RATE_CHANGE);
      });
      this.render();
      if ('requestVideoFrameCallback' in this.clock) this.clock.requestVideoFrameCallback(() => this.tick(loop));
      else requestAnimationFrame(() => this.tick(loop));
    }

    render(seconds = this.clock.currentTime) {
      const current = clamp(seconds, 0, this.duration);
      const progress = this.duration ? current / this.duration : 0;
      if (document.activeElement !== this.slider || this.playing) this.slider.value = Math.round(progress * STEPS);
      this.slider.style.setProperty('--progress', `${progress * 100}%`);
      this.slider.setAttribute('aria-valuetext', `${Math.round(progress * 100)}%, ${time(current)} of ${time(this.duration)}`);
      this.output.textContent = `${time(current)} / ${time(this.duration)}`;
    }

    fail() {
      this.playing = false;
      clearTimeout(this.loading);
      this.videos.forEach((video) => video.pause());
      this.status.textContent = 'Could not load this video. Press Play to retry.';
      this.updateButton();
    }

    updateButton() {
      const ended = !this.playing && this.clock.currentTime >= this.duration - 0.05;
      const label = this.playing ? 'Pause' : ended ? 'Replay' : 'Play';
      this.button.querySelector('.toggle-text').textContent = label;
      this.button.firstElementChild.textContent = this.playing ? 'Ⅱ' : '▶';
      this.button.setAttribute('aria-label', `${label} ${this.example.title}`);
    }
  }

  const players = examples.map((example) => new SyncedPlayer(example));
  if ('IntersectionObserver' in window) {
    // Buffer an example's videos only once it is about to scroll into view.
    const preload = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        players.find((item) => item.row === entry.target).load();
        preload.unobserve(entry.target);
      });
    }, { rootMargin: '300px' });
    const visibility = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const player = players.find((item) => item.row === entry.target);
        if (!entry.isIntersecting && player.playing) player.pause();
      });
    });
    players.forEach((player) => { preload.observe(player.row); visibility.observe(player.row); });
  } else players.forEach((player) => player.load());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) players.forEach((player) => { if (player.playing) player.pause(); });
  });
})();
