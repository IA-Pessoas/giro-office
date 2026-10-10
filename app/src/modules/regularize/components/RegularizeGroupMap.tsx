import { useClientGroups } from "@modules/clients/hooks/useClients";
import { useMemo, useState } from "react";

import { useRegularizeGroupMap } from "../hooks/useRegularizePeople";
import {
  buildGroupMapTree,
  GROUP_MAP_METRICS,
  type GroupMapLayout,
  layoutGroupMapTree,
} from "../utils/groupMapTree";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";

const messageClassName = "mt-4 text-sm text-slate-600 dark:text-slate-400";

function GroupMapDiagram({ layout, title }: { layout: GroupMapLayout; title: string }) {
  const { lineHeight, paddingX, paddingY } = GROUP_MAP_METRICS;

  return (
    <svg
      role="img"
      aria-label={title}
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="text-slate-800 dark:text-slate-100"
    >
      {layout.links.map(({ from, to }) => {
        const startX = from.x + from.width;
        const startY = from.y + from.height / 2;
        const endY = to.y + to.height / 2;
        const middleX = (startX + to.x) / 2;

        return (
          <path
            key={`${from.node.id}>${to.node.id}`}
            d={`M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${to.x} ${endY}`}
            fill="none"
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth={1.5}
          />
        );
      })}
      {layout.boxes.map((box) => (
        <g key={box.node.id}>
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx={8}
            className="fill-white stroke-slate-300 dark:fill-slate-800 dark:stroke-slate-600"
          />
          <text x={box.x + paddingX} y={box.y + paddingY} fontSize={12} fill="currentColor">
            {box.node.lines.map((line, index) => (
              // As linhas de um nó não mudam de ordem.
              // biome-ignore lint/suspicious/noArrayIndexKey: linha fixa dentro do nó
              <tspan key={index} x={box.x + paddingX} dy={index === 0 ? lineHeight - 4 : lineHeight}>
                {line}
              </tspan>
            ))}
          </text>
        </g>
      ))}
    </svg>
  );
}

// Mapa gerado de grupo (#1748): escolhe um grupo e mostra cidade, sócio e empresas com vínculo
// societário vigente. Leitura apenas; a edição e a exportação ficam para a #1749.
export function RegularizeGroupMap() {
  const groupsQuery = useClientGroups();
  const [groupId, setGroupId] = useState("");
  const mapQuery = useRegularizeGroupMap(groupId);
  const layout = useMemo(
    () => (mapQuery.data ? layoutGroupMapTree(buildGroupMapTree(mapQuery.data)) : null),
    [mapQuery.data],
  );
  const hasPartners = mapQuery.data?.cities.some((city) => city.partners.length > 0) ?? false;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Mapa do grupo</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Cidades das empresas do grupo, seus sócios e as empresas de cada sócio com vínculo
        societário vigente na cidade, com situação, sede e regime do cadastro.
      </p>

      <label className="mt-5 block text-sm font-medium text-slate-700 dark:text-slate-200">
        Grupo
        <RegularizeNativeSelect
          className="mt-1.5 sm:w-80"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          disabled={groupsQuery.isLoading}
        >
          <option value="">Selecione um grupo</option>
          {(groupsQuery.data ?? []).map((group) => (
            <option key={group.id} value={group.id}>
              {group.status ? group.name : `${group.name} (inativo)`}
            </option>
          ))}
        </RegularizeNativeSelect>
      </label>

      {groupsQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-rose-700 dark:text-rose-300">
          Não foi possível carregar os grupos. Tente novamente.
        </p>
      ) : !groupId ? (
        <p className={messageClassName}>Escolha um grupo para gerar o mapa.</p>
      ) : mapQuery.isLoading ? (
        <p className={messageClassName}>Gerando o mapa…</p>
      ) : mapQuery.isError || !layout || !mapQuery.data ? (
        <p role="alert" className="mt-4 text-sm text-rose-700 dark:text-rose-300">
          Não foi possível gerar o mapa deste grupo. Tente novamente.
        </p>
      ) : !hasPartners ? (
        <p className={messageClassName}>
          Nenhum sócio com vínculo vigente nas empresas deste grupo. Confira os sócios e a cidade no
          cadastro das empresas.
        </p>
      ) : (
        <div className="mt-4 overflow-auto rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <GroupMapDiagram layout={layout} title={`Mapa do grupo ${mapQuery.data.group.name}`} />
        </div>
      )}
    </section>
  );
}
