import React, { forwardRef } from 'react';

const PotChipStack = forwardRef(function PotChipStack(_, ref) {
  return <div ref={ref} className="pot-chip-stack" aria-hidden="true" />;
});

export default PotChipStack;
