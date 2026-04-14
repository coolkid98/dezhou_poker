import React, { useEffect, useState } from 'react';
import { POT_POS } from '../layout.js';

// 根据金额选择筹码颜色（模仿真实赌场）
//  < 5  → 白
//  < 25 → 红
//  < 100 → 绿
//  < 500 → 蓝
//  >= 500 → 黑
function chipColors(amount) {
  if (amount >= 500) return { base: '#1a1a1a', edge: '#ffffff', text: '#ffd33d' };
  if (amount >= 100) return { base: '#1e3a8a', edge: '#ffffff', text: '#ffffff' };
  if (amount >= 25)  return { base: '#0f7a36', edge: '#ffffff', text: '#ffffff' };
  if (amount >= 5)   return { base: '#b31b1b', edge: '#ffffff', text: '#ffffff' };
  return { base: '#f0f0f0', edge: '#555555', text: '#1a1a1a' };
}

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
