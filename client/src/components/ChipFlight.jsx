import React, { useEffect, useState } from 'react';
import { POT_POS } from '../layout.js';
import { chipColors } from './chipVisuals.js';

export default function ChipFlight({ fromX, fromY, amount, onDone }) {
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    // 下一帧启动 transition，让 React 先挂载在起点位置
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setArrived(true));
    });
    const t = setTimeout(onDone, 950);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  const x = arrived ? POT_POS[0] : fromX;
  const y = arrived ? POT_POS[1] : fromY;
  const c = chipColors(amount);

  return (
    <div className="chip-flight" style={{ left: `${x}%`, top: `${y}%` }}>
      <div
        className="chip-coin"
        style={{
          '--chip-base': c.base,
          '--chip-edge': c.edge,
          color: c.text,
        }}
      >
        <span className="chip-amt">{amount}</span>
      </div>
    </div>
  );
}
