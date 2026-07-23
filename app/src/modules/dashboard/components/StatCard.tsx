import React from "react";
import { motion } from "framer-motion";
import type { StatCardData } from "../types";

interface StatCardProps {
  data: StatCardData;
  delay?: number;
}

const MotionDiv = motion.div;

export function StatCard({ data, delay = 0 }: StatCardProps) {
  const { title, value, icon: Icon, change, changeLabel, color } = data;
  const changeColor = change && change >= 0 ? "#16a34a" : "#dc2626";
  const cardColor = color || "var(--colors-brand-blue)";

  return (
    <MotionDiv
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ scale: 1.02 }}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md"
            style={{
              background: `linear-gradient(to bottom right, ${cardColor}, ${cardColor})`,
            }}
          >
            <Icon size={24} color="white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{title}</p>
          </div>
        </div>

        {change !== undefined ? (
          <div className="text-right">
            <span
              className="text-xs font-medium px-2 py-1 rounded-full"
              style={{
                color: changeColor,
                background: change && change >= 0 ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
              }}
            >
              {change >= 0 ? "+" : ""}
              {change}%
            </span>
            {changeLabel ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{changeLabel}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </MotionDiv>
  );
}
