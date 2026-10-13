/**
 * Mapa de equipamentos de um usuário (#1934), derivado só do inventário de TI: os itens ativos
 * da pessoa e as conexões entre o computador e os periféricos. Como no legado
 * (`tecnologia/pages/usuarios/mapa.php`), marca, entradas, saídas e configuração vêm das
 * observações do item, em trechos no formato `Rótulo: valor`. Observação fora desse padrão não
 * é interpretada: o equipamento aparece sem dado e sem conexão inventada.
 *
 * Não tem relação com o mapa de grupos de clientes do Regularize (`tb_workspace.mapas`).
 */

import { normalizeTiName } from "./inventory.js";

export interface EquipmentNotes {
  brand: string | null;
  inputs: string[];
  outputs: string[];
  configuration: string[];
}

export interface EquipmentMapItem extends EquipmentNotes {
  id: string;
  asset_code: string;
  category: string | null;
  /** Computador ou notebook: é onde os periféricos se ligam. */
  is_host: boolean;
}

export interface EquipmentMapConnection {
  host_id: string;
  equipment_id: string;
  ports: string[];
}

export interface EquipmentMap {
  equipment: EquipmentMapItem[];
  connections: EquipmentMapConnection[];
}

interface EquipmentMapAsset {
  id: string;
  asset_code: string;
  notes?: string | null;
  category?: { name?: string | null } | null;
}

const HOST_CATEGORY_NAMES = new Set(["computador", "notebook"]);

/**
 * O rótulo precisa abrir o trecho (a linha, ou o que vem depois de um `;`), com ou sem marcador
 * de lista; texto corrido que só cita "marca:" não é dado.
 */
const NOTE_SEGMENT = /^[\s\-–•*·]*(?:\d+[.)]\s*)?([\p{L}]+)\s*:\s*(.*)$/u;

const NOTE_FIELDS: Record<string, keyof EquipmentNotes> = {
  marca: "brand",
  entrada: "inputs",
  entradas: "inputs",
  saida: "outputs",
  saidas: "outputs",
  configuracao: "configuration",
  configuracoes: "configuration",
};

function listOf(value: string): string[] {
  return value
    .split(/[,;]/u)
    .map((item) => item.trim().replace(/\.$/u, "").trim())
    .filter((item) => item.length > 0);
}

export function parseEquipmentNotes(notes: unknown): EquipmentNotes {
  const parsed: EquipmentNotes = { brand: null, inputs: [], outputs: [], configuration: [] };
  if (typeof notes !== "string") return parsed;

  for (const line of notes.split(/\r\n|\r|\n/u)) {
    // Uma linha pode trazer mais de um rótulo, separados por `;` ("Marca: Dell; Entradas: HDMI").
    const fields: Array<{ field: keyof EquipmentNotes; value: string }> = [];
    for (const segment of line.split(";")) {
      const match = NOTE_SEGMENT.exec(segment);
      const field = match ? NOTE_FIELDS[normalizeTiName(match[1])] : undefined;
      const current = fields[fields.length - 1];
      if (match && field) {
        fields.push({ field, value: match[2] ?? "" });
      } else if (current) {
        current.value += `;${segment}`;
      }
    }
    for (const { field, value } of fields) {
      if (field === "brand") {
        // A marca fica inteira, como no legado: "Dell, Inc" não é uma lista.
        parsed.brand = value.replace(/[;.\s]+$/u, "").trim() || parsed.brand;
      } else {
        parsed[field].push(...listOf(value));
      }
    }
  }
  return parsed;
}

/** Valores que dizem "não tem": não podem casar dois equipamentos. */
const PLACEHOLDER_PORTS = new Set(["na", "nd", "nao", "naotem", "nenhum", "nenhuma", "semdados"]);

/**
 * Compara portas sem depender de caixa, acento ou pontuação ("hdmi" = "HDMI"). Devolve vazio
 * para o que não é porta ("-", "?", "N/A").
 */
function portKey(port: string): string {
  const key = normalizeTiName(port).replace(/[^a-z0-9]/gu, "");
  return PLACEHOLDER_PORTS.has(key) ? "" : key;
}

export function buildEquipmentMap(assets: EquipmentMapAsset[]): EquipmentMap {
  const equipment = assets.map((asset) => {
    const category = asset.category?.name ?? null;
    return {
      id: asset.id,
      asset_code: asset.asset_code,
      category,
      is_host: HOST_CATEGORY_NAMES.has(normalizeTiName(category)),
      ...parseEquipmentNotes(asset.notes),
    };
  });
  const hosts = equipment.filter((item) => item.is_host);

  const connections = equipment.flatMap((item) => {
    if (item.is_host) return [];
    const itemPorts = new Set([...item.inputs, ...item.outputs].map(portKey));
    itemPorts.delete("");
    const candidates = hosts
      .map((host) => {
        const shared = new Map<string, string>();
        for (const port of host.inputs) {
          const key = portKey(port);
          if (itemPorts.has(key) && !shared.has(key)) shared.set(key, port);
        }
        return { host, ports: [...shared.values()] };
      })
      .filter((candidate) => candidate.ports.length > 0);
    // Com mais de um computador possível, não dá para saber em qual o periférico está.
    const [candidate] = candidates;
    return candidates.length === 1 && candidate
      ? [{ host_id: candidate.host.id, equipment_id: item.id, ports: candidate.ports }]
      : [];
  });

  return { equipment, connections };
}
