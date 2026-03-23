import Head from 'next/head';

interface DepartmentRoutePageProps {
  title: string;
}

export function DepartmentRoutePage({ title }: DepartmentRoutePageProps) {
  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <section className="u-stack u-gap-4 w-full">
        <article className="ui-surface rounded-2xl border border-white/25 bg-gradient-to-b from-white/10 to-white/5 p-5 shadow-md backdrop-blur md:p-6">
          <h1 className="text-2xl font-bold text-[var(--colors-blue-500)] md:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-[color:color-mix(in_srgb,var(--colors-black)_65%,transparent)]">
            Pagina do departamento {title}.
          </p>
        </article>
      </section>
    </>
  );
}
