import React from "react";
import Link from "next/link";
import "react-toastify/dist/ReactToastify.css";
import { ArrowLeft, Save } from "lucide-react";

import { canSSRAdmin } from "@modules/auth";
import { useDepForm, departmentService, type DepItem } from "@modules/departments";
import { DepartmentColorField } from "@modules/departments/components/DepartmentColorField";
import { AdminAccessDeniedState } from "@shared/components/AdminAccessDeniedState";

const PANEL_CLASSNAME =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900";

const INPUT_CLASSNAME =
  "h-13 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-[var(--colors-brand-gradient-end)] focus:ring-2 focus:ring-[var(--colors-brand-gradient-start)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500";

const SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='m5 7.5 5 5 5-5' stroke='%2394a3b8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
} as const;

interface Props {
  dep?: DepItem;
  forbidden?: boolean;
}

export default function Department({ dep, forbidden = false }: Props) {
  if (forbidden) {
    return (
      <AdminAccessDeniedState description="Você não possui permissão para editar departamentos." />
    );
  }

  if (!dep) {
    return null;
  }

  return <DepartmentForm dep={dep} />;
}

function DepartmentForm({ dep }: { dep: DepItem }) {
  const { formData, isDirty, isLoading, handleInputChange, handleUpdate } = useDepForm(dep);

  const handleColorChange = (color: string) => {
    handleInputChange({
      target: {
        name: "color",
        value: color,
      },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="space-y-2">
        <Link
          href="/departments"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para departamentos
        </Link>

        <div>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {dep.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Atualize nome, status e cor do departamento.
          </p>
        </div>
      </div>

      <section className={`${PANEL_CLASSNAME} overflow-visible`}>
        <form
          className="space-y-5 p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            handleUpdate();
          }}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_220px_minmax(260px,320px)] lg:items-start">
            <label className="space-y-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Nome
              </span>
              <input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={INPUT_CLASSNAME}
                placeholder="Nome do departamento"
              />
            </label>

            <label className="space-y-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Status
              </span>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className={`${INPUT_CLASSNAME} appearance-none bg-[length:14px] bg-[position:right_1.25rem_center] bg-no-repeat pr-12`}
                style={SELECT_ARROW_STYLE}
              >
                <option value="Ativo">Ativo</option>
                <option value="Inativo">Inativo</option>
              </select>
            </label>

            <DepartmentColorField value={formData.color} onChange={handleColorChange} />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed ${
                isDirty
                  ? "bg-gradient-to-r from-[var(--colors-brand-gradient-start)] to-[var(--colors-brand-gradient-end)] shadow-lg shadow-blue-950/25 ring-2 ring-[var(--colors-brand-gradient-start)]/20 hover:from-[var(--colors-brand-gradient-hover-start)] hover:to-[var(--colors-brand-gradient-hover-end)]"
                  : "bg-slate-400 shadow-none dark:bg-slate-700"
              } disabled:opacity-60`}
              disabled={isLoading || !isDirty}
            >
              <Save className="h-4 w-4" />
              {isLoading ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export const getServerSideProps = canSSRAdmin<Props>(
  async (ctx) => {
    const { id } = ctx.params as { id: string };

    try {
      const dep = await departmentService.getById(id, ctx);

      if (!dep) {
        return {
          redirect: {
            destination: "/dashboard",
            permanent: false,
          },
        };
      }

      return {
        props: {
          dep,
        },
      };
    } catch {
      return {
        redirect: {
          destination: "/dashboard",
          permanent: false,
        },
      };
    }
  },
  {
    onForbidden: () => ({
      props: {
        forbidden: true,
      },
    }),
  },
);
