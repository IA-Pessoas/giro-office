import Head from "next/head";
import Link from "next/link";
import { ListOrdered, ListTodo, Settings2 } from "lucide-react";

import { canSSRAuth } from "@modules/auth";

const CARDS = [
  {
    href: "/configs/integracao/tasks",
    icon: ListTodo,
    title: "Modelos de Tarefas",
    description: "Gerencie os modelos padrão de tarefas recorrentes.",
  },
  {
    href: "/configs/integracao/plans",
    icon: ListOrdered,
    title: "Planos de Trabalho",
    description: "Monte a sequência de modelos a contratar em cada projeto.",
  },
] as const;

export default function IntegracaoConfig() {
  return (
    <>
      <Head>
        <title>Configurações - Integração</title>
      </Head>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div>
          <h1 className="mb-1 flex items-center gap-3 text-3xl font-bold text-gray-900 dark:text-white">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
              <Settings2 aria-hidden="true" className="h-5 w-5 text-white" />
            </span>
            Configurações da Integração
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Modelos de tarefas e planos de trabalho usados nos projetos.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {CARDS.map(({ href, icon: Icon, title, description }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
            >
              <Icon aria-hidden="true" className="mb-3 h-6 w-6 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
