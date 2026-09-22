import { currentTaskContext } from "../context.js";
import type { PrismaClient } from "../generated/prisma/client.js";

/** Mesmo contrato do `prismaClient` do Node, resolvido para o client da requisição atual. */
export const prismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = currentTaskContext().prisma();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return property in currentTaskContext().prisma();
  },
});

export default prismaClient;
