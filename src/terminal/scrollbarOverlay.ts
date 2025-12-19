export interface ScrollbarOverlayHandle {
  refresh: () => void;
  cleanup: () => void;
}

export function attachScrollbarOverlay(
  container: HTMLElement,
  termElement: HTMLElement | null
): ScrollbarOverlayHandle {
  // xterm renders its scrollable viewport inside .xterm-viewport
  const viewport = termElement?.querySelector('.xterm-viewport') as HTMLElement | null;

  const track = document.createElement('div');
  const thumb = document.createElement('div');
  track.className = 'aiterm-scroll-track';
  thumb.className = 'aiterm-scroll-thumb';
  track.appendChild(thumb);
  container.appendChild(track);

  let lastThumbHeight = 24;
  let dragging = false;

  const maxScroll = () => (viewport ? viewport.scrollHeight - viewport.clientHeight : 0);

  const updateThumb = () => {
    if (!viewport) return;
    const { scrollTop, scrollHeight, clientHeight } = viewport;
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

  const scrollToThumbPosition = (clientY: number) => {
    if (!viewport) return;
    const rect = track.getBoundingClientRect();
    const maxTop = rect.height - lastThumbHeight;
    const offset = Math.min(
      Math.max(clientY - rect.top - lastThumbHeight / 2, 0),
      Math.max(maxTop, 0)
    );
    const ratio = maxTop > 0 ? offset / maxTop : 0;
    viewport.scrollTop = ratio * maxScroll();
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

  const refresh = () => requestAnimationFrame(updateThumb);

  thumb.addEventListener('mousedown', onThumbMouseDown);
  track.addEventListener('mousedown', onTrackMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  viewport?.addEventListener('scroll', refresh);
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
