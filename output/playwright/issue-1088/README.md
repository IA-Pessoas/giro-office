# Evidências Playwright — issue #1088

As imagens deste diretório foram geradas contra o build de produção local com
`app/src/modules/auth/run-auth-sidebar-browser-smoke.mjs`.

- `access/` valida a carteira operacional em desktop (1366×768).
- `mobile/` valida o mesmo fluxo em viewport móvel (390×844).
- Cada diretório contém os perfis Contábil `viewer` (1), editor (2) e administrador (3), todos com Integração desabilitada.

O smoke verifica que `/contabil` permanece acessível, apresenta a competência,
o resumo da carteira e um controle existente ao lado de um cliente sem controle.
