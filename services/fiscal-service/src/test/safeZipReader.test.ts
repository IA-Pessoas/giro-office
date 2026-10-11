import { createZip, ServiceError } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { readZipArchive } from "../services/safeZipReader.js";

const xml = (text: string) => Buffer.from(text, "utf8");

describe("readZipArchive", () => {
  it("lê entradas deflate, ignora pastas e mantém a ordem", () => {
    const zip = createZip([
      { fileName: "notas/a.xml", body: xml("<a/>") },
      { fileName: "notas/", body: Buffer.alloc(0) },
      { fileName: "b.xml", body: xml("<b/>") },
    ]);
    const archive = readZipArchive(zip);
    expect(archive.entries.map((entry) => [entry.name, entry.body.toString()])).toEqual([
      ["notas/a.xml", "<a/>"],
      ["b.xml", "<b/>"],
    ]);
    expect(archive.errors).toEqual([]);
  });

  it("recusa nomes inseguros, repetidos e criptografados por entrada", () => {
    const zip = createZip([
      { fileName: "../fora.xml", body: xml("<x/>") },
      { fileName: "/abs.xml", body: xml("<x/>") },
      { fileName: "c:\\win.xml", body: xml("<x/>") },
      { fileName: "ok.xml", body: xml("<x/>") },
      { fileName: "ok.xml", body: xml("<y/>") },
      { fileName: "secreto.xml", body: xml("<x/>") },
    ]);
    // Liga o bit de criptografia no diretório central da última entrada.
    const central = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt16LE(zip.readUInt16LE(central + 8) | 1, central + 8);

    const archive = readZipArchive(zip);
    expect(archive.entries.map((entry) => entry.name)).toEqual(["ok.xml"]);
    expect(archive.errors).toEqual([
      { entry: "../fora.xml", message: "Nome de arquivo inseguro no ZIP." },
      { entry: "/abs.xml", message: "Nome de arquivo inseguro no ZIP." },
      { entry: "c:\\win.xml", message: "Nome de arquivo inseguro no ZIP." },
      { entry: "ok.xml", message: "Nome repetido no ZIP." },
      { entry: "secreto.xml", message: "Arquivo criptografado não é suportado." },
    ]);
  });

  it("limita o tamanho descompactado por entrada", () => {
    const zip = createZip([
      { fileName: "grande.xml", body: Buffer.alloc(5000, 0x41) },
      { fileName: "pequeno.xml", body: xml("<x/>") },
    ]);
    const archive = readZipArchive(zip, { maxEntryBytes: 1000, maxTotalBytes: 10_000 });
    expect(archive.entries.map((entry) => entry.name)).toEqual(["pequeno.xml"]);
    expect(archive.errors).toEqual([
      { entry: "grande.xml", message: "Arquivo descompactado excede o limite de 1000 bytes." },
    ]);
  });

  it("recusa o arquivo quando a soma descompactada passa do limite", () => {
    const zip = createZip([
      { fileName: "a.xml", body: Buffer.alloc(800, 0x41) },
      { fileName: "b.xml", body: Buffer.alloc(800, 0x41) },
    ]);
    expect(() => readZipArchive(zip, { maxEntryBytes: 1000, maxTotalBytes: 1000 })).toThrow(
      "ZIP descompactado excede o limite de 1000 bytes.",
    );
  });

  it("recusa conteúdo que não é ZIP ou está truncado", () => {
    expect(() => readZipArchive(Buffer.from("não sou zip"))).toThrow(ServiceError);
    const zip = createZip([{ fileName: "a.xml", body: xml("<a/>") }]);
    expect(() => readZipArchive(zip.subarray(0, zip.length - 5))).toThrow("ZIP inválido");
  });

  it("aponta entrada corrompida sem derrubar as demais", () => {
    const zip = createZip([
      { fileName: "a.xml", body: xml("<a>conteúdo</a>") },
      { fileName: "b.xml", body: xml("<b/>") },
    ]);
    // Corrompe os dados comprimidos da primeira entrada (logo após o cabeçalho local).
    zip.fill(0xff, 30 + "a.xml".length, 30 + "a.xml".length + 4);
    const archive = readZipArchive(zip);
    expect(archive.entries.map((entry) => entry.name)).toEqual(["b.xml"]);
    expect(archive.errors).toEqual([{ entry: "a.xml", message: "Arquivo corrompido no ZIP." }]);
  });
});
