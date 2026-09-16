# Milestone 18 — evidência do smoke visual

Capturas geradas pelo smoke do módulo Comercial, com fixtures sintéticas e serviços locais temporários.

Comando executado:

```bash
COMMERCIAL_SMOKE_EVIDENCE_DIR=output/playwright/milestone-18-final-rerun \
  pnpm --filter @workspace/app exec node src/modules/commercial/run-commercial-browser-smoke.mjs
```

As capturas cobrem máscara e precisão do valor contratado, modais de criação e foco, criar/editar/excluir configurações, arquivar prospecções, matriz de acesso e os layouts desktop/mobile claro/escuro. O comando não usa dados reais nem faz deploy.
