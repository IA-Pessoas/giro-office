import React from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/router";
import {
  Briefcase,
  Plus,
  User,
  Users,
} from "lucide-react";
import { isAdminPermission } from "@modules/auth/utils/permissions";
import { useMe } from "@shared/hooks";

interface QuickAction {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "green" | "purple" | "cyan" | "orange" | "indigo";
}

const MotionDiv = motion.div;

export function QuickActions() {
  const router = useRouter();
  const meQuery = useMe();
  const isAdmin = isAdminPermission(meQuery.data?.permission ?? null);

  const actions: QuickAction[] = [
    {
      label: "Criar Cliente",
      icon: Plus,
      href: "/clients",
      tone: "green",
    },
    {
      label: "Ver Clientes",
      icon: Users,
      href: "/clients",
      tone: "blue",
    },
    {
      label: "Ver Usuários",
      icon: User,
      href: "/administracao",
      tone: "purple",
    },
    ...(isAdmin
      ? [
          {
            label: "Departamentos",
            icon: Briefcase,
            href: "/departments",
            tone: "cyan" as const,
          },
        ]
      : []),
  ];

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Ações Rápidas</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {actions.map((action, index) => {
          const Icon = action.icon;
          const tone = action.tone;

          const toneClass =
            tone === "blue"
              ? "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:border-blue-200 dark:hover:border-blue-700 text-blue-600 dark:text-blue-400"
              : tone === "green"
                ? "bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 hover:border-green-200 dark:hover:border-green-700 text-green-600 dark:text-green-400"
                : tone === "purple"
                  ? "bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:border-purple-200 dark:hover:border-purple-700 text-purple-600 dark:text-purple-400"
                  : tone === "cyan"
                    ? "bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 hover:border-cyan-200 dark:hover:border-cyan-700 text-cyan-600 dark:text-cyan-400"
                    : tone === "orange"
                      ? "bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:border-orange-200 dark:hover:border-orange-700 text-orange-600 dark:text-orange-400"
                      : "bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:border-indigo-200 dark:hover:border-indigo-700 text-indigo-600 dark:text-indigo-400";

          return (
            <MotionDiv
              key={action.href + index}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button
                type="button"
                className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all hover:scale-105 group border border-transparent ${toneClass}`}
                onClick={() => router.push(action.href)}
              >
                <Icon className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-gray-900 dark:text-white text-center">
                  {action.label}
                </span>
              </button>
            </MotionDiv>
          );
        })}
      </div>
    </section>
  );
}
