# SDD ledger — plan: .superpowers/plans/issue-712.md

BASE_SHA: 832f0fa2da82742ae3f67469cc26795fb4ad9a44

Task 1: in progress (single coupled TDD task)
Task 1: fix round 1/5 completed (Critical closed: auth-sidebar now has deterministic coverage for integracao=0 + contabil=1/2/3, replacing the browser timeout blocked by `@workspace/api` compile failure; commit 68d635aa)
Task 1: fix round 2/5 completed (Important closed: auth-sidebar voltou a ser smoke real de browser/URL e o AppShell passou a reutilizar uma seam compartilhada pequena para URL + navegação; smoke permanece vermelho apenas por baseline `@workspace/api` no bootstrap real da app)
Task 1: complete (commits 7388cc4e..3c4475e2, review clean after 2 fix rounds; code-simplifier-v2 inspected changed files, no safe simplification applied)
Final review: fix wave started (Standards: catch logging and brittle source-format assertion; Spec: stronger Contábil direct-route evidence and restore dashboard smoke)
Final review: fix wave completed (catch now logs diagnostics before rethrow; brittle AppShell source assertion removed; Contábil smoke now asserts rendered content + sidebar click + absence of denied state; dashboard-hidden smoke restored; `test:auth` green, `test:auth-sidebar` and `typecheck` still blocked by missing `@workspace/api`)
