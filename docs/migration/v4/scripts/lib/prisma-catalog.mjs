import { readFile } from "node:fs/promises";

export async function loadPrismaCatalog(schemaPath) {
  const schema = await readFile(schemaPath, "utf8");
  const parsedModels = findModelBlocks(stripComments(schema)).map(parseModel);
  const modelNames = new Set(parsedModels.map(({ prismaName }) => prismaName));

  const models = parsedModels
    .map((model) => finalizeModel(model, modelNames))
    .sort((left, right) => left.databaseName.localeCompare(right.databaseName));

  return { models };
}

export function getModelByDatabaseName(catalog, table) {
  return catalog?.models?.find((model) => model.databaseName === table) ?? null;
}

export function getFieldByDatabaseName(model, column) {
  return model?.fields?.find((field) => field.databaseName === column) ?? null;
}

export function assertRuleMatchesPrisma(rule, catalog) {
  const model = getModelByDatabaseName(catalog, rule?.destinationTable);
  if (model === null) {
    throw new Error(`Tabela de destino inexistente: ${String(rule?.destinationTable)}`);
  }

  assertDeclaredRelations(model, catalog);

  for (const columnRule of rule.columns ?? []) {
    const field = getFieldByDatabaseName(model, columnRule?.destinationColumn);
    if (field === null) {
      throw new Error(`Coluna de destino inexistente: ${String(columnRule?.destinationColumn)}`);
    }
    if (!field.nullable && !hasNullPolicy(columnRule)) {
      throw new Error(`Campo obrigatório sem política de nulo: ${field.databaseName}`);
    }
  }
}

function findModelBlocks(schema) {
  const blocks = [];
  const matcher = /\bmodel\s+([A-Za-z_]\w*)\s*\{/g;
  let match = matcher.exec(schema);

  while (match !== null) {
    const prismaName = match[1];
    const bodyStart = matcher.lastIndex;
    const bodyEnd = findClosingBrace(schema, bodyStart);
    if (bodyEnd === -1) {
      throw new Error(`Model ${prismaName} malformado: bloco não foi fechado`);
    }

    blocks.push({ prismaName, body: schema.slice(bodyStart, bodyEnd) });
    matcher.lastIndex = bodyEnd + 1;
    match = matcher.exec(schema);
  }

  return blocks;
}

function findClosingBrace(value, start) {
  let depth = 1;
  let quote = null;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseModel({ prismaName, body }) {
  const fields = [];
  const compositeDirectives = [];
  let databaseName = prismaName;

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    if (line.startsWith("@@")) {
      const directive = line.match(/^@@(map|unique|index)\s*\(/)?.[1];
      if (directive === undefined) {
        continue;
      }
      const argumentsText = getDirectiveArguments(line, `@@${directive}`, prismaName);
      if (directive === "map") {
        databaseName = parseMappedName(argumentsText, prismaName, "@@map");
      } else {
        compositeDirectives.push({
          directive,
          fields: parseCompositeFields(argumentsText, prismaName),
        });
      }
      continue;
    }

    if (line.startsWith("@")) {
      continue;
    }

    const field = parseField(line, prismaName);
    if (field === null) {
      throw new Error(`Model ${prismaName} malformado: declaração de campo inválida`);
    }
    fields.push(field);
  }

  const physicalNames = new Map(fields.map((field) => [field.prismaName, field.databaseName]));
  const mapCompositeFields = (fieldNames) =>
    fieldNames.map((fieldName) => {
      const databaseFieldName = physicalNames.get(fieldName);
      if (databaseFieldName === undefined) {
        throw new Error(`Model ${prismaName} malformado: campo composto inexistente ${fieldName}`);
      }
      return databaseFieldName;
    });

  return {
    prismaName,
    databaseName,
    fields,
    compoundUnique: compositeDirectives
      .filter(({ directive }) => directive === "unique")
      .map(({ fields: fieldNames }) => mapCompositeFields(fieldNames)),
    indexes: compositeDirectives
      .filter(({ directive }) => directive === "index")
      .map(({ fields: fieldNames }) => mapCompositeFields(fieldNames)),
  };
}

function parseField(line, modelName) {
  const match = line.match(/^([A-Za-z_]\w*)\s+(\S+)(?:\s+(.*))?$/);
  if (match === null) {
    return null;
  }

  const [, prismaName, rawType, attributes = ""] = match;
  const list = rawType.endsWith("[]");
  const nullable = rawType.endsWith("?");
  const prismaType = rawType.replace(/\?$/, "").replace(/\[\]$/, "");
  const mapArguments = findDirectiveArguments(attributes, "@map");
  const relationArguments = findDirectiveArguments(attributes, "@relation");

  return {
    model: modelName,
    prismaName,
    databaseName:
      mapArguments === null ? prismaName : parseMappedName(mapArguments, modelName, "@map"),
    prismaType,
    nullable,
    list,
    id: /@id\b/.test(attributes),
    unique: /@unique\b/.test(attributes),
    relationModel: null,
    relationFields:
      relationArguments === null ? [] : parseRelationFieldList(relationArguments, "fields"),
    relationReferences:
      relationArguments === null ? [] : parseRelationFieldList(relationArguments, "references"),
  };
}

function finalizeModel(model, modelNames) {
  return {
    ...model,
    fields: model.fields.map((field) => ({
      ...field,
      relationModel: modelNames.has(field.prismaType) ? field.prismaType : null,
    })),
  };
}

function getDirectiveArguments(value, directive, modelName) {
  const argumentsText = findDirectiveArguments(value, directive);
  if (argumentsText === null) {
    throw new Error(`Model ${modelName} malformado: ${directive} sem fechamento`);
  }
  return argumentsText;
}

function findDirectiveArguments(value, directive) {
  const start = value.indexOf(`${directive}(`);
  if (start === -1) {
    return null;
  }

  const openingParenthesis = start + directive.length;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openingParenthesis; index < value.length; index += 1) {
    const character = value[index];
    if (quote !== null) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(openingParenthesis + 1, index);
      }
    }
  }

  return null;
}

function parseMappedName(argumentsText, modelName, directive) {
  const match = argumentsText.match(/^\s*"([^"]+)"\s*$/);
  if (match === null) {
    throw new Error(`Model ${modelName} malformado: ${directive} inválido`);
  }
  return match[1];
}

function parseCompositeFields(argumentsText, modelName) {
  const match = argumentsText.match(/^\s*\[([^\]]*)\]/);
  if (match === null) {
    throw new Error(`Model ${modelName} malformado: índice composto inválido`);
  }

  return splitTopLevel(match[1]).map((entry) => {
    const fieldName = entry.trim().match(/^([A-Za-z_]\w*)/)?.[1];
    if (fieldName === undefined) {
      throw new Error(`Model ${modelName} malformado: campo composto inválido`);
    }
    return fieldName;
  });
}

function parseRelationFieldList(argumentsText, name) {
  const match = argumentsText.match(new RegExp(`\\b${name}\\s*:\\s*\\[([^\\]]*)\\]`));
  if (match === null) {
    return [];
  }

  return splitTopLevel(match[1])
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitTopLevel(value) {
  const entries = [];
  let start = 0;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") {
      depth += 1;
    } else if (value[index] === ")") {
      depth -= 1;
    } else if (value[index] === "," && depth === 0) {
      entries.push(value.slice(start, index));
      start = index + 1;
    }
  }
  entries.push(value.slice(start));
  return entries;
}

function assertDeclaredRelations(model, catalog) {
  for (const relation of model.fields.filter((field) => field.relationModel !== null)) {
    for (const fieldName of relation.relationFields) {
      if (!model.fields.some((field) => field.prismaName === fieldName)) {
        throw new Error(
          `Relação ${model.prismaName}.${relation.prismaName} declara coluna ausente ${fieldName}`,
        );
      }
    }

    const relatedModel = catalog.models.find(
      (candidate) => candidate.prismaName === relation.relationModel,
    );
    if (relatedModel === undefined) {
      throw new Error(
        `Relação ${model.prismaName}.${relation.prismaName} referencia model inexistente`,
      );
    }
    for (const referenceName of relation.relationReferences) {
      if (!relatedModel.fields.some((field) => field.prismaName === referenceName)) {
        throw new Error(
          `Relação ${model.prismaName}.${relation.prismaName} declara referência ausente ${referenceName}`,
        );
      }
    }
  }
}

function hasNullPolicy(columnRule) {
  return typeof columnRule?.nullHandling === "string" && columnRule.nullHandling.trim().length > 0;
}

function stripComments(schema) {
  let result = "";
  let index = 0;
  let quote = null;

  while (index < schema.length) {
    const character = schema[index];
    const next = schema[index + 1];
    if (quote !== null) {
      result += character;
      if (character === "\\") {
        result += next ?? "";
        index += 2;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      result += character;
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      while (index < schema.length && schema[index] !== "\n") {
        index += 1;
      }
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (index < schema.length && !(schema[index] === "*" && schema[index + 1] === "/")) {
        result += schema[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      index += 2;
      continue;
    }
    result += character;
    index += 1;
  }

  return result;
}
