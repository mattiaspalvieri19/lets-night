'use client';

import { useEffect, useRef } from 'react';

export default function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mx = 0, my = 0, cx = 0, cy = 0, raf;

    const onMove = (e) => {
      mx = e.clientX;
      my = e.clientY;
    };

    const tick = () => {
      cx += (mx - cx) * 0.14;
      cy += (my - cy) * 0.14;
      dot.style.transform = 'translate(' + (mx - 4) + 'px,' + (my - 4) + 'px)';
      ring.style.transform = 'translate(' + (cx - 20) + 'px,' + (cy - 20) + 'px)';
      raf = requestAnimationFrame(tick);
    };

    const onOver = (e) => {
      if (e.target.closest('a, button, input, textarea, select, .ev-card, [role="button"]')) {
        ring.classList.add('expand');
      }
    };

    const onOut = () => ring.classList.remove('expand');

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    tick();

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div className="cur-dot" ref={dotRef} />
      <div className="cur-ring" ref={ringRef} />
    </>
  );
}
