import React, { useEffect, useRef, useState } from 'react';
import { POT_POS } from '../layout.js';
import { chipColors } from './chipVisuals.js';

function coord(value, fallbackPercent) {
  if (value == null) return `${fallbackPercent}%`;
  return typeof value === 'number' ? `${value}px` : value;
}

export default function ChipFlight({ fromX, fromY, targetX, targetY, amount, onDone }) {
  const [arrived, setArrived] = useState(false);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const complete = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current?.();
    };
    // 下一帧启动 transition，让 React 先挂载在起点位置
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setArrived(true));
    });
    const t = setTimeout(complete, 860);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, []);

  const x = arrived ? coord(targetX, POT_POS[0]) : `${fromX}%`;
  const y = arrived ? coord(targetY, POT_POS[1]) : `${fromY}%`;
  const c = chipColors(amount);

  return (
    <div
      className="chip-flight"
      style={{ left: x, top: y }}
      onTransitionEnd={(e) => {
        if (e.propertyName === 'left' && arrived && !doneRef.current) {
          doneRef.current = true;
          onDoneRef.current?.();
        }
      }}
    >
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
