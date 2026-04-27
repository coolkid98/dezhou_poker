import React from 'react';
import { chipColors, potChipStyle } from './chipVisuals.js';

export default function PotChipStack({ chips }) {
  if (!chips?.length) return null;
  return (
    <div className="pot-chip-stack" aria-hidden="true">
      {chips.slice(-30).map((chip, i) => {
        const c = chipColors(chip.amount);
        return (
          <div
            key={chip.id}
            className="pot-stack-chip"
            style={{
              ...potChipStyle(i),
              '--chip-base': c.base,
              '--chip-edge': c.edge,
            }}
          />
        );
      })}
    </div>
  );
}
