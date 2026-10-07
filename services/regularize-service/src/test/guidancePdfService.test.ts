import "./envBootstrap.js";

import { beforeEach, describe, expect, it, vi } from "vitest";

const drawing = vi.hoisted(() => ({
  texts: [] as { value: string; x: number }[],
  rects: [] as { width: number; height: number }[],
  pages: 0,
}));

vi.mock("pdfkit", () => ({
  default: class {
    private handlers = new Map<string, (...args: unknown[]) => void>();

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, handler);
      return this;
    }
    end() {
      this.handlers.get("data")?.(Buffer.from("%PDF-"));
      this.handlers.get("end")?.();
    }
    roundedRect() {
      return this;
    }
    rect(_x: number, _y: number, width: number, height: number) {
      drawing.rects.push({ width, height });
      return this;
    }
    lineWidth() {
      return this;
    }
    stroke() {
      return this;
    }
    fill() {
      return this;
    }
    font() {
      return this;
    }
    fontSize() {
      return this;
    }
    fillColor() {
      return this;
    }
    image() {
      return this;
    }
    addPage() {
      drawing.pages++;
      return this;
    }
    heightOfString(value: string, options: { width: number }) {
      return Math.ceil(Math.max(1, value.length) / Math.max(1, Math.floor(options.width / 5))) * 11;
    }
    text(value: string, x: number) {
      drawing.texts.push({ value, x });
      return this;
    }
  },
}));

import { renderGuidancePdf } from "../services/guidancePdfService.js";

const base = {
  company_name: "Empresa Alfa",
  target_snapshot: {},
  economic_activities: [],
  partners: [],
};

beforeEach(() => {
  drawing.texts.length = 0;
  drawing.rects.length = 0;
  drawing.pages = 0;
});

describe("renderGuidancePdf", () => {
  it("uses the constitution observation without adding a request row", async () => {
    const pdf = await renderGuidancePdf({
      ...base,
      request: "CONSTITUIÇÃO",
      framework_obs: "Observação informada",
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(drawing.texts.map(({ value }) => value)).toContain("Observação informada");
    expect(drawing.texts.map(({ value }) => value)).not.toContain("CONSTITUIÇÃO");
    expect(drawing.rects).toContainEqual({ width: 9, height: 9 });
  });

  it("lays out unaccented alterations in three columns and partners side by side", async () => {
    await renderGuidancePdf({
      ...base,
      request: "ALTERACAO CONTRATUAL - RAZÃO SOCIAL, CAPITAL SOCIAL, ATIVIDADES",
      partners: [
        { name: "Ana", percentage: 60 },
        { name: "Beto", percentage: 40 },
      ],
    });

    const changes = drawing.texts.filter(({ value }) => /^\d\. /.test(value));
    expect(changes.map(({ value }) => value)).toEqual([
      "1. RAZÃO SOCIAL",
      "2. CAPITAL SOCIAL",
      "3. ATIVIDADES",
    ]);
    expect(changes[0].x).toBeLessThan(changes[1].x);
    expect(changes[1].x).toBeLessThan(changes[2].x);
    const ana = drawing.texts.find(({ value }) => value === "Ana");
    const beto = drawing.texts.find(({ value }) => value === "Beto");
    expect(ana?.x).toBeLessThan(beto?.x ?? 0);
  });

  it("paginates long text and rejects absent or excessive data", async () => {
    await renderGuidancePdf({
      ...base,
      request: "CONSTITUIÇÃO",
      comporate_purpose: "X".repeat(2500),
    });
    expect(drawing.pages).toBeGreaterThan(0);
    await expect(renderGuidancePdf({ target_snapshot: {}, partners: [] })).rejects.toMatchObject({
      statusCode: 422,
    });
    await expect(
      renderGuidancePdf({
        ...base,
        request: "CONSTITUIÇÃO",
        comporate_purpose: "X".repeat(33_000),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});
