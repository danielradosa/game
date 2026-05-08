import { useEffect, useRef } from 'react';

export default function CharacterPreview({ ch }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    let raf, t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, 200, 240);
      const cx = 100, by = 200;
      const bob = Math.sin(t * 0.05) * 2;
      ctx.save();
      ctx.translate(cx, by + bob); ctx.scale(2.2, 2.2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 2, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ch.pants; ctx.fillRect(-9, -13, 8, 13); ctx.fillRect(1, -13, 8, 13);
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-9, -1.5, 8, 2.5); ctx.fillRect(1, -1.5, 8, 2.5);
      ctx.fillStyle = ch.shirt; ctx.fillRect(-10, -25, 20, 13);
      ctx.fillStyle = ch.accent; ctx.fillRect(-10, -18, 20, 1.2);
      ctx.fillStyle = ch.shirt; ctx.fillRect(-13, -24, 4, 11); ctx.fillRect(9, -24, 4, 11);
      ctx.fillStyle = ch.skin; ctx.fillRect(-13, -14, 4, 3); ctx.fillRect(9, -14, 4, 3);
      ctx.fillStyle = ch.skin; ctx.beginPath(); ctx.arc(0, -29, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ch.hair;
      if (ch.hairStyle === 'short') {
        ctx.beginPath(); ctx.arc(0, -32, 7, Math.PI, 0); ctx.fill();
      } else if (ch.hairStyle === 'med') {
        ctx.beginPath(); ctx.arc(0, -32, 8, Math.PI, 0); ctx.fill();
        ctx.fillRect(-8, -32, 3, 7); ctx.fillRect(5, -32, 3, 5);
      } else {
        ctx.beginPath(); ctx.arc(0, -32, 8, Math.PI, 0); ctx.fill();
        ctx.fillRect(-8, -33, 3, 16); ctx.fillRect(5, -33, 3, 16);
      }
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-3, -29, 1.5, 1.5); ctx.fillRect(2, -29, 1.5, 1.5);
      ctx.restore();
      t++; raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [ch]);
  return <canvas ref={ref} width={200} height={240} />;
}
