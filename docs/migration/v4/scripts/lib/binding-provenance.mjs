import crypto from "node:crypto";

const FUNCTION_KEYS = new Set(["length", "name", "arguments", "caller", "prototype"]);

export function createBindingSnapshot(value) {
  const snapshot = snapshotBindingValue(value, new WeakSet());
  const exactReferences = snapshot.exactReferences
    .map(({ kind, path, reference }) =>
      Object.freeze({ kind, path: JSON.stringify(path), reference }),
    )
    .sort((left, right) => compareText(referenceKey(left), referenceKey(right)));
  for (let index = 1; index < exactReferences.length; index += 1) {
    if (referenceKey(exactReferences[index - 1]) === referenceKey(exactReferences[index])) {
      throw new TypeError("Caminho de referência exata duplicado na binding");
    }
  }
  return Object.freeze({
    digest: sha256(JSON.stringify(snapshot.encoding)),
    exactReferences: Object.freeze(exactReferences),
  });
}

export function validateBindingSnapshot(label, expected, value) {
  if (!isBindingSnapshot(expected)) {
    throw new TypeError(`Snapshot autenticado ${label} é obrigatório`);
  }
  const current = createBindingSnapshot(value);
  if (current.digest !== expected.digest) {
    throw new Error(`Integridade do snapshot ${label} foi violada`);
  }
  if (current.exactReferences.length !== expected.exactReferences.length) {
    throw new Error(`Integridade das referências exatas ${label} foi violada`);
  }
  for (let index = 0; index < expected.exactReferences.length; index += 1) {
    const expectedReference = expected.exactReferences[index];
    const currentReference = current.exactReferences[index];
    if (
      referenceKey(expectedReference) !== referenceKey(currentReference) ||
      expectedReference.reference !== currentReference.reference
    ) {
      throw new Error(`Integridade das referências exatas ${label} foi violada`);
    }
  }
  return true;
}

function snapshotBindingValue(value, active) {
  if (value === null) return bindingLeaf(["null"]);
  if (typeof value === "boolean") return bindingLeaf(["boolean", value]);
  if (typeof value === "string") return bindingLeaf(["string", value]);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Number não finito não é permitido em binding");
    }
    return bindingLeaf(["number", Object.is(value, -0) ? "-0" : String(value)]);
  }
  if (typeof value === "bigint") throw new TypeError("BigInt não é suportado em binding");
  if (typeof value === "undefined") {
    throw new TypeError("undefined não é permitido em binding");
  }
  if (typeof value === "symbol") throw new TypeError("Symbol não é permitido em binding");
  if (typeof value === "function") return snapshotBindingFunction(value, active);
  if (typeof value !== "object") throw new TypeError("Tipo de binding não suportado");
  if (active.has(value)) throw new TypeError("Binding cíclica não é permitida");
  active.add(value);
  try {
    if (value instanceof Map) return snapshotBindingMap(value, active);
    if (Array.isArray(value)) return snapshotBindingArray(value, active);
    if (Object.getPrototypeOf(value) === Object.prototype) {
      return snapshotBindingObject(value, active);
    }
    throw new TypeError("Protótipo especial não é permitido em binding");
  } finally {
    active.delete(value);
  }
}

function snapshotBindingFunction(value, active) {
  assertFunctionKeys(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = requireDataDescriptor(descriptors.length, "function.length");
  const name = requireDataDescriptor(descriptors.name, "function.name");
  if (!Number.isSafeInteger(length.value) || length.value < 0 || typeof name.value !== "string") {
    throw new TypeError("Descritores length/name inválidos em binding");
  }
  const entries = [];
  const exactReferences = [{ kind: "function", path: [], reference: value }];
  for (const key of Object.keys(descriptors).sort(compareText)) {
    if (key === "prototype") continue;
    const descriptor = requireDataDescriptor(descriptors[key], `function.${key}`);
    const child = snapshotBindingValue(descriptor.value, active);
    entries.push([key, descriptorFlags(descriptor), child.encoding]);
    exactReferences.push(
      ...prefixExactReferences(child.exactReferences, ["function-property", key]),
    );
  }
  let prototypeEncoding = ["prototype", "absent"];
  if (descriptors.prototype !== undefined) {
    const descriptor = requireDataDescriptor(descriptors.prototype, "function.prototype");
    const prototype = snapshotFunctionPrototype(value, descriptor.value);
    prototypeEncoding = ["prototype", "present", descriptorFlags(descriptor), prototype.encoding];
    exactReferences.push({
      kind: "function-prototype",
      path: [["function-prototype"]],
      reference: descriptor.value,
    });
  }
  return {
    encoding: [
      "function",
      Object.isExtensible(value),
      sha256(Function.prototype.toString.call(value)),
      entries,
      prototypeEncoding,
    ],
    exactReferences,
  };
}

function snapshotFunctionPrototype(callback, prototype) {
  if (
    prototype === null ||
    typeof prototype !== "object" ||
    Object.getPrototypeOf(prototype) !== Object.prototype
  ) {
    throw new TypeError("Prototype padrão de função é obrigatório");
  }
  const keys = Reflect.ownKeys(prototype);
  if (keys.length !== 1 || keys[0] !== "constructor") {
    throw new TypeError("Prototype de função não pode ter propriedades ou Symbols extras");
  }
  const constructorDescriptor = requireDataDescriptor(
    Object.getOwnPropertyDescriptor(prototype, "constructor"),
    "function.prototype.constructor",
  );
  if (constructorDescriptor.value !== callback) {
    throw new TypeError("Constructor do prototype deve apontar para a função autenticada");
  }
  return {
    encoding: [
      "function-prototype",
      Object.isExtensible(prototype),
      descriptorFlags(constructorDescriptor),
    ],
  };
}

function snapshotBindingObject(value, active) {
  const keys = assertPlainDataProperties(value, "object").sort(compareText);
  const entries = [];
  const exactReferences = [];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const child = snapshotBindingValue(descriptor.value, active);
    entries.push([key, descriptorFlags(descriptor), child.encoding]);
    exactReferences.push(...prefixExactReferences(child.exactReferences, ["object-property", key]));
  }
  return {
    encoding: ["object", Object.isExtensible(value), entries],
    exactReferences,
  };
}

function snapshotBindingArray(value, active) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError("Protótipo de array não suportado em binding");
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    throw new TypeError("Array com Symbol não é permitido em binding");
  }
  if (
    ownKeys.length !== value.length + 1 ||
    ownKeys.some(
      (key) =>
        key !== "length" &&
        (!/^(?:0|[1-9][0-9]*)$/.test(key) ||
          !Number.isSafeInteger(Number(key)) ||
          Number(key) >= value.length),
    )
  ) {
    throw new TypeError(
      "Array com propriedade custom ou posição ausente não é permitido em binding",
    );
  }
  const length = requireDataDescriptor(
    Object.getOwnPropertyDescriptor(value, "length"),
    "array.length",
  );
  const entries = [];
  const exactReferences = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = requireDataDescriptor(
      Object.getOwnPropertyDescriptor(value, String(index)),
      `array.${index}`,
    );
    if (descriptor.enumerable !== true) {
      throw new TypeError("Array com posição não enumerável não é permitido");
    }
    const child = snapshotBindingValue(descriptor.value, active);
    entries.push([String(index), descriptorFlags(descriptor), child.encoding]);
    exactReferences.push(
      ...prefixExactReferences(child.exactReferences, ["array-index", String(index)]),
    );
  }
  return {
    encoding: [
      "array",
      Object.isExtensible(value),
      [descriptorFlags(length), bindingLeafNumber(value.length)],
      entries,
    ],
    exactReferences,
  };
}

function snapshotBindingMap(value, active) {
  if (Object.getPrototypeOf(value) !== Map.prototype || Reflect.ownKeys(value).length !== 0) {
    throw new TypeError("Map com protótipo ou propriedade custom não é permitido em binding");
  }
  const entries = [];
  for (const [key, entryValue] of Map.prototype.entries.call(value)) {
    const keySnapshot = snapshotBindingValue(key, active);
    const keyCanonical = JSON.stringify(keySnapshot.encoding);
    const valueSnapshot = snapshotBindingValue(entryValue, active);
    entries.push({ keyCanonical, keySnapshot, valueSnapshot });
  }
  entries.sort((left, right) => compareText(left.keyCanonical, right.keyCanonical));
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].keyCanonical === entries[index].keyCanonical) {
      throw new TypeError("Map possui chave canônica duplicada ou ambígua");
    }
  }
  const exactReferences = [];
  for (const entry of entries) {
    exactReferences.push(
      ...prefixExactReferences(entry.keySnapshot.exactReferences, ["map-key", entry.keyCanonical]),
      ...prefixExactReferences(entry.valueSnapshot.exactReferences, [
        "map-value",
        entry.keyCanonical,
      ]),
    );
  }
  return {
    encoding: [
      "map",
      Object.isExtensible(value),
      entries.map(({ keySnapshot, valueSnapshot }) => [
        keySnapshot.encoding,
        valueSnapshot.encoding,
      ]),
    ],
    exactReferences,
  };
}

function assertFunctionKeys(value) {
  const keys = Reflect.ownKeys(value);
  if (
    keys.some(
      (key) => typeof key === "symbol" || typeof key !== "string" || !FUNCTION_KEYS.has(key),
    )
  ) {
    throw new TypeError("Função com propriedade custom ou Symbol não é permitida em binding");
  }
  if (!keys.includes("length") || !keys.includes("name")) {
    throw new TypeError("Descritores length/name são obrigatórios em binding");
  }
}

function assertPlainDataProperties(value, label) {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === "symbol")) {
    throw new TypeError(`${label} com Symbol não é permitido em binding`);
  }
  for (const key of keys) {
    const descriptor = requireDataDescriptor(Object.getOwnPropertyDescriptor(value, key), label);
    if (descriptor.enumerable !== true) {
      throw new TypeError(`${label} com propriedade não enumerável não é permitido`);
    }
  }
  return keys;
}

function requireDataDescriptor(descriptor, label) {
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError(`${label} com accessor não é permitido em binding`);
  }
  return descriptor;
}

function descriptorFlags(descriptor) {
  return [
    "data-descriptor",
    descriptor.enumerable === true,
    descriptor.configurable === true,
    descriptor.writable === true,
  ];
}

function bindingLeaf(encoding) {
  return { encoding, exactReferences: [] };
}

function bindingLeafNumber(value) {
  return ["number", Object.is(value, -0) ? "-0" : String(value)];
}

function prefixExactReferences(references, segment) {
  return references.map(({ kind, path, reference }) => ({
    kind,
    path: [segment, ...path],
    reference,
  }));
}

function isBindingSnapshot(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.digest === "string" &&
    Array.isArray(value.exactReferences)
  );
}

function referenceKey(reference) {
  return `${reference.kind}\0${reference.path}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
