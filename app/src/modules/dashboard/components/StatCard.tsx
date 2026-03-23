import React from 'react';
import { motion } from 'framer-motion';
import type { StatCardData } from '../types';

interface StatCardProps {
  data: StatCardData;
  delay?: number;
}

const MotionDiv = motion.div;

export function StatCard({ data, delay = 0 }: StatCardProps) {
  const { title, value, icon: Icon, change, changeLabel, color } = data;
  const changeColor = change && change >= 0 ? '#16a34a' : '#dc2626';
  const cardColor = color || 'var(--colors-blue-500)';

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.02 }}
      className="dashboard-card relative cursor-pointer overflow-hidden"
      style={{ borderLeftColor: cardColor }}
    >
      <div className="u-flex u-justify-between mb-4 items-start">
        <div>
          <p className="dashboard-card-subtitle mb-1 font-medium">
            {title}
          </p>
          <p className="text-3xl font-bold text-slate-800">
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
          </p>
          {change !== undefined && (
            <div className="u-flex u-items-center mt-2">
              <span className="text-sm font-medium" style={{ color: changeColor }}>
                {change >= 0 ? '+' : ''}{change}%
              </span>
              {changeLabel && (
                <span className="ml-2 text-xs text-slate-500">
                  {changeLabel}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="rounded-full p-3" style={{ background: `${cardColor}20`, color: cardColor }}>
          <Icon size={24} />
        </div>
      </div>
    </MotionDiv>
  );
}
