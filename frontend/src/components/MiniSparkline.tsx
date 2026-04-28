'use client';

import React from 'react';

export interface MiniSparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function MiniSparkline({
  values,
  width = 80,
  height = 20,
  color = '#60a5fa',
  className,
}: MiniSparklineProps) {
  if (values.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      />
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const PAD = 1;
  const usableW = width - PAD * 2;
  const usableH = height - PAD * 2;

  const points = values
    .map((v, i) => {
      const x = PAD + (i / (values.length - 1)) * usableW;
      const y = PAD + usableH - ((v - min) / range) * usableH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
