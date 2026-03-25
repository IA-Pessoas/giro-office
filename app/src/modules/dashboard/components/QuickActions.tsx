import React from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/router';
import {
  FiUsers,
  FiUser,
  FiBriefcase,
  FiLayers,
  FiPlus,
} from 'react-icons/fi';
import type { IconType } from 'react-icons';

interface QuickAction {
  label: string;
  icon: IconType;
  href: string;
  color?: string;
}

const MotionDiv = motion.div;

export function QuickActions() {
  const router = useRouter();
  const primaryColor = 'var(--colors-brand-blue)';

  const actions: QuickAction[] = [
    {
      label: 'Criar Cliente',
      icon: FiPlus,
      href: '/clients',
      color: primaryColor,
    },
    {
      label: 'Ver Clientes',
      icon: FiUsers,
      href: '/clients',
    },
    {
      label: 'Ver Usuários',
      icon: FiUser,
      href: '/users',
    },
    {
      label: 'Organizações',
      icon: FiBriefcase,
      href: '/organizations',
    },
    {
      label: 'Departamentos',
      icon: FiLayers,
      href: '/triagem',
    },
  ];

  return (
    <section className="dashboard-card dashboard-quick-actions p-4" style={{ borderLeftColor: primaryColor }}>
      <p className="dashboard-card-subtitle mb-4 text-xs font-bold uppercase tracking-wider">
        Ações Rápidas
      </p>
      <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
        {actions.map((action, index) => (
          <MotionDiv
            key={action.href + index}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="min-w-full flex-1 sm:min-w-0 sm:flex-none"
          >
            <button
              type="button"
              className="u-flex u-items-center u-gap-2 w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--colors-brand-blue)]"
              style={{ color: action.color || 'var(--colors-brand-blue)' }}
              onClick={() => router.push(action.href)}
            >
              <action.icon size={18} />
              {action.label}
            </button>
          </MotionDiv>
        ))}
      </div>
    </section>
  );
}
