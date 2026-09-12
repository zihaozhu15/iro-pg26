/* Paired frame players: one index, one clock, and an atomic update for both views. */
(() => {
  const container = document.querySelector('#result-examples');
  const examples = window.RESULTS_DATA;
  if (!container || !examples) return;

  const time = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const loadImage = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try { await image.decode(); resolve(image); }
      catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error(`Unable to load ${url}`));
    image.src = url;
  });

  class FramePlayer {
    constructor(example) {
      this.example = example;
      this.index = 0;
      this.revision = 0;
      this.playing = false;
      this.ready = false;
      this.cache = new Map();
      this.cacheLimit = Math.max(3, Math.min(10, Math.floor(48 * 1024 * 1024 / (example.width * example.height * 8))));
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
            <p class="result-legend"><span class="legend-initial">Initial contour</span><span class="legend-target">Target strokes</span></p>
          </figure>
          <div class="result-playback" role="group" aria-label="${example.title}: synchronized views">
            <div class="result-views">
              ${['blender', 'optimization'].map((track) => `
                <figure>
                  <figcaption>${track === 'blender' ? 'In Blender' : 'In Optimization'}</figcaption>
                  <div class="result-frame">
                    <img class="result-poster" src="${example.tracks[track][0]}" loading="lazy" alt="${example.title}: ${track} initial frame" width="${example.width}" height="${example.height}">
                    <canvas width="${example.width}" height="${example.height}" role="img" aria-label="${example.title}: ${track} view"></canvas>
                  </div>
                </figure>`).join('')}
            </div>
            <div class="result-controls">
              <button class="result-toggle" type="button" aria-label="Play ${example.title}"><span aria-hidden="true">▶</span><span class="toggle-text">Play</span></button>
              <input type="range" min="0" max="${example.frameCount - 1}" step="1" value="0" aria-label="${example.title}: synchronized progress" aria-valuetext="Start">
              <output class="result-time">0:00 / ${time(example.duration)}</output>
            </div>
            <p class="result-status" role="status" aria-live="polite"></p>
          </div>
        </div>
        <p class="result-credit">Character model © ${example.copyrightHolder}</p>`;
      container.append(this.row);
      this.button = this.row.querySelector('.result-toggle');
      this.slider = this.row.querySelector('input');
      this.output = this.row.querySelector('output');
      this.status = this.row.querySelector('.result-status');
      this.canvases = [...this.row.querySelectorAll('canvas')];
      this.button.addEventListener('click', () => this.playing ? this.pause() : this.play());
      this.slider.addEventListener('input', () => {
        this.pause();
        this.show(Number(this.slider.value));
      });
    }

    pair(index) {
      if (this.cache.has(index)) {
        const cached = this.cache.get(index);
        this.cache.delete(index);
        this.cache.set(index, cached);
        return cached;
      }
      const promise = Promise.all([
        loadImage(this.example.tracks.blender[index]),
        loadImage(this.example.tracks.optimization[index]),
      ]).catch((error) => { this.cache.delete(index); throw error; });
      this.cache.set(index, promise);
      // Bound decoded-image memory; the browser can reuse downloaded files.
      while (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
      return promise;
    }

    async show(index) {
      const revision = ++this.revision;
      this.row.setAttribute('aria-busy', 'true');
      const loading = setTimeout(() => {
        if (revision === this.revision) this.status.textContent = 'Loading frames…';
      }, 200);
      try {
        const images = await this.pair(index);
        if (revision !== this.revision) return false;
        // Await both decoded images, then paint both within the same browser task.
        this.canvases.forEach((canvas, i) => {
          canvas.getContext('2d').drawImage(images[i], 0, 0, canvas.width, canvas.height);
          canvas.dataset.frame = index;
        });
        this.row.classList.add('frames-ready');
        this.ready = true;
        this.index = index;
        this.slider.value = index;
        this.slider.style.setProperty('--progress', `${index / (this.example.frameCount - 1) * 100}%`);
        this.slider.setAttribute('aria-valuetext', `${Math.round(index / (this.example.frameCount - 1) * 100)}%, frame ${index + 1} of ${this.example.frameCount}`);
        this.output.textContent = `${time(this.example.duration * index / (this.example.frameCount - 1))} / ${time(this.example.duration)}`;
        this.status.textContent = '';
        this.row.dataset.frame = index;
        this.updateButton();
        for (let next = index + 1; next <= Math.min(index + 2, this.example.frameCount - 1); next++) {
          this.pair(next).catch(() => {});
        }
        return true;
      } catch {
        if (revision === this.revision) {
          this.pause();
          this.status.textContent = 'Could not load this frame. Press Play or move the slider to retry.';
        }
        return false;
      } finally {
        clearTimeout(loading);
        if (revision === this.revision) this.row.setAttribute('aria-busy', 'false');
      }
    }

    updateButton() {
      const label = this.playing ? 'Pause' : this.index === this.example.frameCount - 1 ? 'Replay' : 'Play';
      this.button.querySelector('.toggle-text').textContent = label;
      this.button.firstElementChild.textContent = this.playing ? 'Ⅱ' : '▶';
      this.button.setAttribute('aria-label', `${label} ${this.example.title}`);
    }

    pause() {
      this.playing = false;
      clearTimeout(this.timer);
      this.updateButton();
    }

    async play() {
      this.playing = true;
      this.updateButton();
      const first = this.index === this.example.frameCount - 1 ? 0 : Number(this.slider.value);
      const shown = await this.show(first);
      if (shown && this.playing) this.schedule();
    }

    schedule() {
      if (this.index === this.example.frameCount - 1) { this.pause(); return; }
      this.timer = setTimeout(async () => {
        const shown = await this.show(this.index + 1);
        if (shown && this.playing) this.schedule();
      }, this.example.duration * 1000 / (this.example.frameCount - 1));
    }
  }

  const players = examples.map((example) => new FramePlayer(example));
  if ('IntersectionObserver' in window) {
    const preload = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const player = players.find((item) => item.row === entry.target);
          if (player.revision === 0) player.show(0);
          preload.unobserve(entry.target);
        }
      });
    }, { rootMargin: '300px' });
    const visibility = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) players.find((item) => item.row === entry.target).pause();
      });
    });
    players.forEach((player) => { preload.observe(player.row); visibility.observe(player.row); });
  } else players.forEach((player) => player.show(0));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) players.forEach((player) => player.pause());
  });
})();
