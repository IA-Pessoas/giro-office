import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sem cache incremental: todas as paginas sao SSR, nao ha ISR nem fetch cache para guardar.
export default defineCloudflareConfig({});
