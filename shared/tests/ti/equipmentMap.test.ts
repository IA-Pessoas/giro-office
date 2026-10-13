import assert from "node:assert/strict";
import test from "node:test";

import { buildEquipmentMap, parseEquipmentNotes } from "../../src/ti/equipmentMap.ts";

test("lê marca, entradas, saídas e configuração das observações no padrão do legado (#1934)", () => {
  assert.deepEqual(
    parseEquipmentNotes(
      "Marca: Dell;\r\nEntradas: HDMI, VGA; DisplayPort.\nConfigurações: i5, 8GB RAM, SSD 240GB.",
    ),
    {
      brand: "Dell",
      inputs: ["HDMI", "VGA", "DisplayPort"],
      outputs: [],
      configuration: ["i5", "8GB RAM", "SSD 240GB"],
    },
  );
  assert.deepEqual(parseEquipmentNotes("marca: Logitech\nSaída: P2, USB"), {
    brand: "Logitech",
    inputs: [],
    outputs: ["P2", "USB"],
    configuration: [],
  });
  assert.deepEqual(parseEquipmentNotes("Entrada: HDMI").inputs, ["HDMI"]);
});

test("aceita marcador de lista, dois rótulos na mesma linha e marca com vírgula (#1934)", () => {
  assert.deepEqual(parseEquipmentNotes("- Marca: Dell, Inc.\n• Entradas: HDMI\n1) Saída: P2"), {
    brand: "Dell, Inc",
    inputs: ["HDMI"],
    outputs: ["P2"],
    configuration: [],
  });
  assert.deepEqual(parseEquipmentNotes("Marca: Dell; Entradas: HDMI, VGA; Configurações: i5"), {
    brand: "Dell",
    inputs: ["HDMI", "VGA"],
    outputs: [],
    configuration: ["i5"],
  });
  // Trecho sem rótulo continua o anterior, como a linha inteira do legado.
  assert.equal(parseEquipmentNotes("Marca: LG; modelo 24MK").brand, "LG; modelo 24MK");
  assert.deepEqual(parseEquipmentNotes("Entradas: HDMI; VGA").inputs, ["HDMI", "VGA"]);
});

test("observação fora do padrão não vira dado do equipamento (#1934)", () => {
  const empty = { brand: null, inputs: [], outputs: [], configuration: [] };

  for (const notes of [
    null,
    undefined,
    "",
    "Monitor trocado em março, cabo HDMI novo",
    "Obs: a marca: Dell foi informada pelo usuário",
    "Entradas:",
    "Marca:   ;",
  ]) {
    assert.deepEqual(parseEquipmentNotes(notes), empty, String(notes));
  }
});

const asset = (id: string, category: string, notes: string | null) => ({
  id,
  asset_code: id.toUpperCase(),
  category: { name: category },
  notes,
});

test("liga o periférico ao computador pelas portas em comum (#1934)", () => {
  const map = buildEquipmentMap([
    asset("pc-1", "Computador", "Marca: Dell\nEntradas: HDMI, VGA, P2\nConfigurações: i5, 8GB"),
    asset("mon-1", "Monitor horizontal", "Marca: LG\nEntradas: hdmi; DisplayPort"),
    asset("fone-1", "Fone", "Saída: P2"),
    asset("mouse-1", "Mouse", "Marca: Logitech"),
  ]);

  assert.deepEqual(
    map.equipment.map((item) => [item.id, item.category, item.brand, item.is_host]),
    [
      ["pc-1", "Computador", "Dell", true],
      ["mon-1", "Monitor horizontal", "LG", false],
      ["fone-1", "Fone", null, false],
      ["mouse-1", "Mouse", "Logitech", false],
    ],
  );
  assert.deepEqual(map.equipment[0]?.configuration, ["i5", "8GB"]);
  assert.deepEqual(map.connections, [
    { host_id: "pc-1", equipment_id: "mon-1", ports: ["HDMI"] },
    { host_id: "pc-1", equipment_id: "fone-1", ports: ["P2"] },
  ]);
});

test("não inventa conexão quando o dado é ambíguo ou não existe (#1934)", () => {
  // Sem portas em comum, sem computador, ou observações que não seguem o padrão.
  assert.deepEqual(
    buildEquipmentMap([
      asset("pc-1", "Computador", "Entradas: VGA"),
      asset("mon-1", "Monitor", "Entradas: HDMI"),
      asset("mon-2", "Monitor", "ligado no HDMI do computador"),
      asset("mon-3", "Monitor", null),
    ]).connections,
    [],
  );
  assert.deepEqual(
    buildEquipmentMap([asset("mon-1", "Monitor", "Entradas: HDMI")]).connections,
    [],
  );
  // "Não tem" ou símbolo solto dos dois lados não é porta em comum.
  for (const placeholder of ["-", "?", "N/A", "nenhuma", "Não tem"]) {
    assert.deepEqual(
      buildEquipmentMap([
        asset("pc-1", "Computador", `Entradas: ${placeholder}`),
        asset("mon-1", "Monitor", `Entradas: ${placeholder}`),
      ]).connections,
      [],
      placeholder,
    );
  }
  // Porta repetida aparece uma vez; item sem categoria é periférico sem conexão.
  assert.deepEqual(
    buildEquipmentMap([
      asset("pc-1", "Computador", "Entradas: HDMI, hdmi, VGA"),
      asset("mon-1", "Monitor", "Entradas: HDMI"),
      { id: "x-1", asset_code: "X-1", category: null, notes: null },
    ]),
    {
      equipment: [
        {
          id: "pc-1",
          asset_code: "PC-1",
          category: "Computador",
          is_host: true,
          brand: null,
          inputs: ["HDMI", "hdmi", "VGA"],
          outputs: [],
          configuration: [],
        },
        {
          id: "mon-1",
          asset_code: "MON-1",
          category: "Monitor",
          is_host: false,
          brand: null,
          inputs: ["HDMI"],
          outputs: [],
          configuration: [],
        },
        {
          id: "x-1",
          asset_code: "X-1",
          category: null,
          is_host: false,
          brand: null,
          inputs: [],
          outputs: [],
          configuration: [],
        },
      ],
      connections: [{ host_id: "pc-1", equipment_id: "mon-1", ports: ["HDMI"] }],
    },
  );
  // Dois computadores com a mesma porta: não dá para saber em qual o monitor está.
  const twoHosts = buildEquipmentMap([
    asset("pc-1", "Computador", "Entradas: HDMI"),
    asset("note-1", "Notebook", "Entradas: HDMI"),
    asset("mon-1", "Monitor", "Entradas: HDMI"),
    asset("fone-1", "Fone", "Saída: P2"),
  ]);
  assert.deepEqual(twoHosts.connections, []);
  assert.deepEqual(
    twoHosts.equipment.map((item) => item.is_host),
    [true, true, false, false],
  );
  // O equipamento aparece mesmo sem nenhum dado interpretável.
  assert.deepEqual(buildEquipmentMap([asset("mon-3", "Monitor", null)]).equipment, [
    {
      id: "mon-3",
      asset_code: "MON-3",
      category: "Monitor",
      is_host: false,
      brand: null,
      inputs: [],
      outputs: [],
      configuration: [],
    },
  ]);
});
