import { useClientGroups } from "@modules/clients/hooks/useClients";
import { formatDateTime } from "@shared/utils/dateFormat";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import {
  useRegularizeGroupMap,
  useRegularizeSavedGroupMap,
  useSaveRegularizeGroupMapMutation,
} from "../hooks/useRegularizePeople";
import { downloadGroupMapPng } from "../utils/groupMapExport";
import {
  addGroupMapChild,
  buildGroupMapTree,
  countGroupMapNodes,
  findGroupMapNode,
  GROUP_MAP_COLORS,
  GROUP_MAP_DEFAULT_COLOR,
  GROUP_MAP_MAX_DEPTH,
  GROUP_MAP_MAX_NODES,
  GROUP_MAP_METRICS,
  type GroupMapLayout,
  type GroupMapNode,
  groupMapLinesFromText,
  groupMapNodeDepth,
  groupMapTextColor,
  layoutGroupMapTree,
  removeGroupMapNode,
  updateGroupMapNode,
} from "../utils/groupMapTree";
import { getRegularizeMutationErrorMessage } from "../utils/regularizeForm";
import { RegularizeNativeSelect } from "./RegularizeNativeSelect";
import {
  regularizePrimaryButtonClassName,
  regularizeSecondaryButtonClassName,
  regularizeTextareaClassName,
} from "./regularizeFormControls";

const messageClassName = "mt-4 text-sm text-slate-600 dark:text-slate-400";
const alertClassName = "mt-4 text-sm text-rose-700 dark:text-rose-300";
const labelClassName = "block text-sm font-medium text-slate-700 dark:text-slate-200";

// O mapa em edição. Só vira versão salva pelo botão Salvar.
type Draft = {
  groupId: string;
  tree: GroupMapNode;
  origin: "saved" | "generated";
  dirty: boolean;
};

// Ação que descartaria alterações não salvas e espera a confirmação da pessoa.
type PendingAction = { kind: "group"; groupId: string } | { kind: "regenerate" };

// Cores e fonte nos atributos, sem classes: o PNG é este mesmo SVG serializado.
function GroupMapDiagram({
  layout,
  title,
  selectedId,
  onSelect,
  svgRef,
}: {
  layout: GroupMapLayout;
  title: string;
  selectedId: string;
  onSelect?: (id: string) => void;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const {
    baselineOffset,
    cornerRadius,
    fontSize,
    lineHeight,
    margin,
    paddingX,
    paddingY,
    titleFontSize,
    titleHeight,
  } = GROUP_MAP_METRICS;
  // O título em negrito pode ser mais largo que a árvore de um grupo pequeno.
  const titleWidth = title.length * titleFontSize * 0.62;
  const width = Math.max(layout.width, titleWidth) + margin * 2;
  const height = layout.height + titleHeight + margin * 2;

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={title}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fontFamily="Arial, Helvetica, sans-serif"
    >
      <rect width={width} height={height} fill="#ffffff" />
      <text
        x={width / 2}
        y={margin + titleFontSize}
        textAnchor="middle"
        fontSize={titleFontSize}
        fontWeight="bold"
        fill="#333333"
      >
        {title}
      </text>
      <g transform={`translate(${margin}, ${margin + titleHeight})`}>
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
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          );
        })}
        {layout.boxes.map((box) => {
          const background = box.node.color ?? GROUP_MAP_DEFAULT_COLOR;

          return (
            <g
              key={box.node.id}
              className={onSelect ? "cursor-pointer" : undefined}
              onClick={onSelect ? () => onSelect(box.node.id) : undefined}
            >
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                rx={cornerRadius}
                fill={background}
                stroke="#475569"
              />
              {box.node.id === selectedId ? (
                <rect
                  data-export-skip=""
                  x={box.x - 3}
                  y={box.y - 3}
                  width={box.width + 6}
                  height={box.height + 6}
                  rx={cornerRadius + 3}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={3}
                />
              ) : null}
              <text
                x={box.x + paddingX}
                y={box.y + paddingY}
                fontSize={fontSize}
                fill={groupMapTextColor(background)}
              >
                {box.node.lines.map((line, index) => (
                  // As linhas de um nó não mudam de ordem: o índice serve de chave.
                  <tspan
                    key={index}
                    x={box.x + paddingX}
                    dy={index === 0 ? lineHeight - baselineOffset : lineHeight}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// Mapa de grupo (#1748, #1749): gera a árvore do cadastro, deixa editar itens e cores, salva a
// versão do grupo e baixa o PNG. A versão salva só muda pelo botão Salvar: nem a carteira nem
// "Gerar de novo" mexem nela sozinhos.
export function RegularizeGroupMap({ canEdit }: { canEdit: boolean }) {
  const groupsQuery = useClientGroups();
  const [groupId, setGroupId] = useState("");
  const mapQuery = useRegularizeGroupMap(groupId);
  const savedQuery = useRegularizeSavedGroupMap(groupId);
  const saveMutation = useSaveRegularizeGroupMapMutation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [editText, setEditText] = useState("");
  const [editColor, setEditColor] = useState<string>(GROUP_MAP_DEFAULT_COLOR);
  const [newText, setNewText] = useState("");
  const [exportError, setExportError] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const refetchMap = mapQuery.refetch;
  const groupsUpdatedAt = groupsQuery.dataUpdatedAt;
  // O painel de grupos logo acima recarrega a lista ao salvar: o mapa gerado acompanha. O
  // rascunho em edição não é trocado por isso.
  useEffect(() => {
    if (groupId) void refetchMap();
  }, [groupsUpdatedAt, groupId, refetchMap]);

  const current = draft?.groupId === groupId ? draft : null;
  const savedMap = savedQuery.data;
  const generatedMap = mapQuery.data?.group.id === groupId ? mapQuery.data : undefined;
  // Ao abrir um grupo: a versão salva, se houver; senão o mapa gerado. Só na primeira vez,
  // para as recargas das consultas não apagarem o que a pessoa está editando.
  // Espera as consultas terminarem: o que está em cache pode ser de antes de outra pessoa salvar.
  const savedReady = savedQuery.isSuccess && !savedQuery.isFetching;
  const generatedReady = !mapQuery.isFetching;
  useEffect(() => {
    if (!groupId || current || !savedReady) return;
    if (savedMap) {
      setDraft({ groupId, tree: savedMap.tree, origin: "saved", dirty: false });
    } else if (generatedMap && generatedReady) {
      setDraft({
        groupId,
        tree: buildGroupMapTree(generatedMap),
        origin: "generated",
        dirty: false,
      });
    }
  }, [groupId, current, savedReady, generatedReady, savedMap, generatedMap]);

  const layout = useMemo(() => (current ? layoutGroupMapTree(current.tree) : null), [current]);
  const selected = current && selectedId ? findGroupMapNode(current.tree, selectedId) : null;
  const groupName =
    groupsQuery.data?.find((group) => group.id === groupId)?.name ?? generatedMap?.group.name ?? "";
  const title = groupName ? `Mapa do grupo ${groupName}` : "Mapa do grupo";
  const isLoading = Boolean(groupId) && !current && (savedQuery.isFetching || mapQuery.isFetching);
  const loadFailed = !current && (savedQuery.isError || mapQuery.isError);

  function openGroup(nextGroupId: string) {
    setGroupId(nextGroupId);
    setDraft(null);
    setSelectedId("");
    setNewText("");
    setExportError("");
    saveMutation.reset();
  }

  // Trocar de grupo ou gerar de novo joga fora o rascunho: com alterações não salvas, a tela
  // pede confirmação antes.
  function selectGroup(nextGroupId: string) {
    if (current?.dirty) setPending({ kind: "group", groupId: nextGroupId });
    else openGroup(nextGroupId);
  }

  function requestRegenerate() {
    if (current?.dirty) setPending({ kind: "regenerate" });
    else void regenerate();
  }

  function confirmPending() {
    const action = pending;
    setPending(null);
    if (action?.kind === "group") openGroup(action.groupId);
    else if (action?.kind === "regenerate") void regenerate();
  }

  function selectNode(id: string) {
    const target = current ? findGroupMapNode(current.tree, id) : null;
    if (!target) return;
    setSelectedId(id);
    setEditText(target.lines.join("\n"));
    setEditColor(target.color ?? GROUP_MAP_DEFAULT_COLOR);
  }

  function changeTree(tree: GroupMapNode) {
    if (!current) return;
    setDraft({ ...current, tree, dirty: true });
  }

  function applyEdit() {
    const lines = groupMapLinesFromText(editText);
    if (!current || !selected || lines.length === 0) return;
    changeTree(updateGroupMapNode(current.tree, selected.id, { lines, color: editColor }));
  }

  function addChild() {
    const lines = groupMapLinesFromText(newText);
    if (!current || !selected || lines.length === 0) return;
    changeTree(addGroupMapChild(current.tree, selected.id, lines));
    setNewText("");
  }

  function removeSelected() {
    if (!current || !selected) return;
    changeTree(removeGroupMapNode(current.tree, selected.id));
    setSelectedId("");
  }

  // Troca o rascunho pelo mapa do cadastro de agora. A versão salva continua como está até
  // a pessoa salvar.
  async function regenerate() {
    if (!current) return;
    const { data } = await refetchMap();
    if (!data) return;
    // Se a pessoa trocou de grupo enquanto a consulta voltava, o rascunho de agora não é este.
    setDraft((draftNow) =>
      draftNow?.groupId === data.group.id
        ? { ...draftNow, tree: buildGroupMapTree(data), origin: "generated", dirty: true }
        : draftNow,
    );
    setSelectedId("");
  }

  // Volta ao que estava ao abrir o grupo: o efeito acima recarrega a versão salva ou o gerado.
  function discard() {
    setDraft(null);
    setSelectedId("");
    void savedQuery.refetch();
  }

  async function save() {
    if (!current) return;
    const sent = current;
    try {
      const saved = await saveMutation.mutateAsync({ groupId: sent.groupId, tree: sent.tree });
      // Só marca como salvo se o rascunho ainda é o que foi enviado.
      setDraft((draftNow) =>
        draftNow?.groupId === sent.groupId && draftNow.tree === sent.tree
          ? { ...draftNow, tree: saved.tree, origin: "saved", dirty: false }
          : draftNow,
      );
    } catch {
      // O erro aparece pelo estado da mutation.
    }
  }

  async function exportPng() {
    if (!svgRef.current) return;
    setExportError("");
    try {
      await downloadGroupMapPng(svgRef.current, title);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Não foi possível gerar o PNG.");
    }
  }

  const isSaving = saveMutation.isPending;
  const isRoot = selected?.id === current?.tree.id;
  const isFull = current ? countGroupMapNodes(current.tree) >= GROUP_MAP_MAX_NODES : false;
  const isTooDeep =
    current && selected
      ? groupMapNodeDepth(current.tree, selected.id) >= GROUP_MAP_MAX_DEPTH
      : false;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Mapa do grupo</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Cidades das empresas do grupo, seus sócios e as empresas de cada sócio com vínculo
        societário vigente na cidade, com situação, sede e regime do cadastro. O mapa pode ser
        ajustado e salvo; a versão salva só muda quando alguém salva de novo.
      </p>

      <label className={`${labelClassName} mt-5`}>
        Grupo
        <RegularizeNativeSelect
          className="mt-1.5 block sm:w-80"
          value={groupId}
          onChange={(event) => selectGroup(event.target.value)}
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
        <p role="alert" className={alertClassName}>
          Não foi possível carregar os grupos. Tente novamente.
        </p>
      ) : !groupId ? (
        <p className={messageClassName}>Escolha um grupo para abrir o mapa.</p>
      ) : isLoading ? (
        <p className={messageClassName}>Carregando o mapa…</p>
      ) : loadFailed || !current || !layout ? (
        <p role="alert" className={alertClassName}>
          Não foi possível abrir o mapa deste grupo. Tente novamente.
        </p>
      ) : (
        <>
          <p className={messageClassName} role="status">
            {current.origin === "saved" && savedMap
              ? `Versão salva em ${formatDateTime(savedMap.updated_at)}.`
              : "Mapa gerado do cadastro, ainda não salvo."}
            {current.dirty ? " Há alterações não salvas." : ""}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {canEdit ? (
              <button
                type="button"
                className={regularizePrimaryButtonClassName}
                disabled={isSaving || (!current.dirty && current.origin === "saved")}
                onClick={() => void save()}
              >
                {isSaving ? "Salvando…" : "Salvar mapa"}
              </button>
            ) : null}
            {/* Quem só consulta também pode ver o mapa atual do cadastro; só não salva. */}
            <button
              type="button"
              className={regularizeSecondaryButtonClassName}
              disabled={isSaving || mapQuery.isFetching}
              onClick={requestRegenerate}
            >
              Gerar de novo do cadastro
            </button>
            <button
              type="button"
              className={regularizeSecondaryButtonClassName}
              disabled={isSaving || !current.dirty}
              onClick={discard}
            >
              Descartar alterações
            </button>
            <button
              type="button"
              className={regularizeSecondaryButtonClassName}
              onClick={() => void exportPng()}
            >
              Baixar PNG
            </button>
          </div>

          {pending ? (
            <div
              role="alert"
              className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
            >
              <span>
                {pending.kind === "group"
                  ? "Trocar de grupo descarta as alterações não salvas deste mapa."
                  : "Gerar de novo descarta as alterações não salvas deste mapa."}
              </span>
              <button
                type="button"
                className={regularizeSecondaryButtonClassName}
                onClick={confirmPending}
              >
                Descartar e continuar
              </button>
              <button
                type="button"
                className={regularizeSecondaryButtonClassName}
                onClick={() => setPending(null)}
              >
                Cancelar
              </button>
            </div>
          ) : null}

          {saveMutation.isError ? (
            <p role="alert" className={alertClassName}>
              {getRegularizeMutationErrorMessage(
                saveMutation.error,
                "Não foi possível salvar o mapa. Tente novamente.",
              )}
            </p>
          ) : null}
          {exportError ? (
            <p role="alert" className={alertClassName}>
              {exportError}
            </p>
          ) : null}

          {canEdit ? (
            selected ? (
              <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700 lg:grid-cols-2">
                <div className="space-y-3">
                  <label className={labelClassName}>
                    Texto do item selecionado
                    <textarea
                      className={`${regularizeTextareaClassName} mt-1.5`}
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                    />
                  </label>
                  <label className={labelClassName}>
                    Cor
                    <RegularizeNativeSelect
                      className="mt-1.5 block sm:w-48"
                      value={editColor}
                      onChange={(event) => setEditColor(event.target.value)}
                    >
                      {GROUP_MAP_COLORS.map((color) => (
                        <option key={color.value} value={color.value}>
                          {color.label}
                        </option>
                      ))}
                    </RegularizeNativeSelect>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={regularizeSecondaryButtonClassName}
                      disabled={isSaving || groupMapLinesFromText(editText).length === 0}
                      onClick={applyEdit}
                    >
                      Atualizar item
                    </button>
                    <button
                      type="button"
                      className={regularizeSecondaryButtonClassName}
                      disabled={isSaving || isRoot}
                      onClick={removeSelected}
                    >
                      Remover item
                    </button>
                  </div>
                  {isRoot ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      O item do grupo não pode ser removido.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <label className={labelClassName}>
                    Novo item abaixo do selecionado
                    <textarea
                      className={`${regularizeTextareaClassName} mt-1.5`}
                      value={newText}
                      onChange={(event) => setNewText(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={regularizeSecondaryButtonClassName}
                    disabled={
                      isSaving ||
                      isFull ||
                      isTooDeep ||
                      groupMapLinesFromText(newText).length === 0
                    }
                    onClick={addChild}
                  >
                    Adicionar item
                  </button>
                  {isFull ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      O mapa chegou ao limite de {GROUP_MAP_MAX_NODES} itens.
                    </p>
                  ) : isTooDeep ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      O mapa vai até {GROUP_MAP_MAX_DEPTH} níveis; este item já está no último.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className={messageClassName}>Clique em um item do mapa para editar.</p>
            )
          ) : null}

          <div className="mt-4 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700">
            <GroupMapDiagram
              layout={layout}
              title={title}
              selectedId={selectedId}
              onSelect={canEdit ? selectNode : undefined}
              svgRef={svgRef}
            />
          </div>
        </>
      )}
    </section>
  );
}
