export interface ScrollbarOverlayHandle {
  refresh: () => void;
  cleanup: () => void;
}

export interface ScrollbarTick {
  line: number;
  classes?: string[];
  title?: string;
}

export interface ScrollbarOverlayOptions {
  getTicks?: () => ScrollbarTick[];
  getTotalLines?: () => number;
}

export function attachScrollbarOverlay(
  container: HTMLElement,
  termElement: HTMLElement | null,
  options?: ScrollbarOverlayOptions
): ScrollbarOverlayHandle {
  // Attach to the provided container so it can live in that container's right padding gutter.
  // Callers should prefer passing the xterm host element (outside xterm).
  const host = container;

  // Ensure positioning context for the absolute-positioned overlay.
  if (window.getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }

  // xterm renders its scrollable viewport inside .xterm-viewport.
  // On first mount, it may not exist yet; resolve lazily.
  let viewport: HTMLElement | null = null;
  let viewportListenerAttached = false;

  const track = document.createElement('div');
  const thumb = document.createElement('div');
  track.className = 'aiterm-scroll-track';
  thumb.className = 'aiterm-scroll-thumb';

  const ticksLayer = document.createElement('div');
  ticksLayer.className = 'aiterm-scroll-ticks';

  track.appendChild(ticksLayer);
  track.appendChild(thumb);
  // Mount inside the provided container. The container is expected to have a reserved
  // right gutter so the overlay does not overlap xterm content.
  track.style.position = '';
  track.style.top = '';
  track.style.left = '';
  track.style.height = '';
  track.style.width = '';
  host.appendChild(track);

  let lastThumbHeight = 24;
  let dragging = false;


  const resolveViewport = () => {
    if (!viewport) {
      viewport = termElement?.querySelector('.xterm-viewport') as HTMLElement | null;
    }
    if (viewport && !viewportListenerAttached) {
      viewport.addEventListener('scroll', refresh);
      viewportListenerAttached = true;
    }
    return viewport;
  };

  const maxScroll = () => {
    const v = resolveViewport();
    return v ? v.scrollHeight - v.clientHeight : 0;
  };

  const updateThumb = () => {
    const v = resolveViewport();
    if (!v) return;
    const { scrollTop, scrollHeight, clientHeight } = v;
    const trackHeight = track.clientHeight || clientHeight;
    const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
    lastThumbHeight = thumbHeight;

    const maxTop = trackHeight - thumbHeight;
    const top =
      scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * maxTop : 0;

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${top}px)`;
    thumb.style.opacity = scrollHeight > clientHeight ? '1' : '0';
  };

  const updateTicks = () => {
    const getTicks = options?.getTicks;
    const getTotalLines = options?.getTotalLines;
    if (!getTicks || !getTotalLines) return;

    const totalLines = Math.max(1, getTotalLines());
    const ticks = getTicks();

    ticksLayer.replaceChildren();

    const denom = Math.max(1, totalLines - 1);
    for (const tick of ticks) {
      if (!Number.isFinite(tick.line) || tick.line < 0) continue;
      const ratio = Math.min(1, Math.max(0, tick.line / denom));

      const el = document.createElement('div');
      el.className = 'aiterm-scroll-tick';
      if (tick.classes?.length) {
        el.classList.add(...tick.classes);
      }
      if (tick.title) {
        el.title = tick.title;
      }

      el.style.top = `${ratio * 100}%`;
      ticksLayer.appendChild(el);
    }
  };

  const scrollToThumbPosition = (clientY: number) => {
    const v = resolveViewport();
    if (!v) return;
    const rect = track.getBoundingClientRect();
    const maxTop = rect.height - lastThumbHeight;
    const offset = Math.min(
      Math.max(clientY - rect.top - lastThumbHeight / 2, 0),
      Math.max(maxTop, 0)
    );
    const ratio = maxTop > 0 ? offset / maxTop : 0;
    v.scrollTop = ratio * maxScroll();
  };

  const onThumbMouseDown = (e: MouseEvent) => {
    dragging = true;
    thumb.classList.add('dragging');
    e.preventDefault();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    scrollToThumbPosition(e.clientY);
  };

  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('dragging');
  };

  const onTrackMouseDown = (e: MouseEvent) => {
    if (e.target === thumb) return;
    scrollToThumbPosition(e.clientY);
  };

  const refresh = () =>
    requestAnimationFrame(() => {
      updateThumb();
      updateTicks();
    });

  // (DEV debug outlines removed)

  thumb.addEventListener('mousedown', onThumbMouseDown);
  track.addEventListener('mousedown', onTrackMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('resize', refresh);

  refresh();

  const cleanup = () => {
    viewport?.removeEventListener('scroll', refresh);
    window.removeEventListener('resize', refresh);
    thumb.removeEventListener('mousedown', onThumbMouseDown);
    track.removeEventListener('mousedown', onTrackMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    track.remove();
  };

  return { refresh, cleanup };
}
