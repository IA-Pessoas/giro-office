import JSZip from "jszip";

export const noahHtml = `<html><body><script>throw new Error("HTML não deve executar")</script>
<table id="TBLResultado">
<tr><td>Nome do beneficiário</td><td></td><td></td><td></td><td></td><td>Data</td><td>Valor</td></tr>
<tr><td>Fornecedor &amp; Cia</td><td></td><td></td><td></td><td></td><td>09/10/2026</td><td>1.234,56</td></tr>
<tr><td>Outro fornecedor</td><td></td><td></td><td></td><td>08/10/2026</td><td>50,00</td><td>Efetuado</td></tr>
</table></body></html>`;

export async function noahZip(files: Record<string, string> = { "comprovante.html": noahHtml }) {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content, { createFolders: false });
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
