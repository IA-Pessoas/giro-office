import Head from "next/head";
import Link from "next/link";
import { SearchX } from "lucide-react";

// #1370: sem esta página o Next mostrava o 404 padrão, em inglês e sem link de volta.
export default function NotFoundPage() {
  return (
    <>
      <Head>
        <title>Página não encontrada | Office</title>
      </Head>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
          <SearchX aria-hidden="true" className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Página não encontrada</h1>
        <p className="text-gray-600 dark:text-gray-400">
          O endereço não existe ou foi movido. Confira o link ou volte para o início.
        </p>
        <Link
          href="/dashboard"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Ir para o dashboard
        </Link>
      </div>
    </>
  );
}
