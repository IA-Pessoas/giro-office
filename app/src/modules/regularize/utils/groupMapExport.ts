// Exportação do mapa de grupo em PNG (#1749). A imagem sai do próprio SVG que está na tela,
// com cores e fonte nos atributos, então o arquivo é o que a pessoa vê (menos o destaque do
// item selecionado, marcado com data-export-skip).

const PNG_SCALE = 2;
// ponytail: o canvas tem teto de lado nos navegadores; mapa maior que isso sai com menos
// resolução. Fatiar em várias imagens se algum grupo passar muito disso.
const MAX_CANVAS_SIDE = 8192;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível montar a imagem do mapa."));
    image.src = url;
  });
}

export function groupMapFileName(title: string): string {
  const name = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${name || "mapa-do-grupo"}.png`;
}

export async function downloadGroupMapPng(svg: SVGSVGElement, title: string): Promise<void> {
  const width = svg.viewBox.baseVal.width;
  const height = svg.viewBox.baseVal.height;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  for (const element of clone.querySelectorAll("[data-export-skip]")) element.remove();
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const markup = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadImage(svgUrl);
    const scale = Math.min(PNG_SCALE, MAX_CANVAS_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível montar a imagem do mapa.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Não foi possível gerar o PNG do mapa.");
    const pngUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = groupMapFileName(title);
    link.click();
    URL.revokeObjectURL(pngUrl);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
