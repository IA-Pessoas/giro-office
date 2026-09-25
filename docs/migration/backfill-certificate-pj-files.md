# Arquivos de certificados PJ legados (#1379)

O dump `tb_certificados.pj.sql` contém o ID legado e a referência `arquivo`. Os binários `.pfx`/`.p12` ficam fora do repositório. O script usa a identidade UUID V5 da migração V4 para localizar o certificado atual e chama o upload do `certificate-service`, que valida o PKCS#12, cifra o arquivo e grava os metadados no storage atual. O download é comparado por SHA-256 antes de registrar sucesso.

```sh
node scripts/backfill-certificate-pj-files.mjs \
  --dump /caminho/privado/tb_certificados.pj.sql \
  --assets /caminho/privado/arquivos \
  --report /tmp/certificados-pj-inventario.json
```

Esse primeiro passo é somente local: encontra arquivos únicos e relata `sem_referencia`, `arquivo_ausente`, `arquivo_ambiguo`, `tipo_nao_suportado` ou problemas de ID. O relatório contém apenas IDs e estados, nunca senhas, caminhos ou conteúdo dos arquivos.

Para conferir o vínculo com a base de destino, defina `CERTIFICATE_MIGRATION_TOKEN` no ambiente com autorização para ler e enviar certificados da organização Castelo e execute um dry-run com `--certificate-api` apontando para o prefixo do certificado, por exemplo `https://host/api/certificate`. Ele verifica ID, organização e CNPJ, e mostra `pronto`, `ja_migrado` ou o motivo pendente.

```sh
node scripts/backfill-certificate-pj-files.mjs \
  --dump /caminho/privado/tb_certificados.pj.sql \
  --assets /caminho/privado/arquivos \
  --certificate-api https://host/api/certificate \
  --report /tmp/certificados-pj-dry-run.json
```

Depois de conferir o relatório, repita com outro `--report` e `--apply`. O script não sobrescreve relatórios, não envia arquivo se o certificado já tiver um e confirma o download após cada upload. Se a identidade V4 não corresponder ao registro atual, ele registra `certificado_destino_ausente`; é preciso resolver esse vínculo antes de migrar o arquivo. Faça nova execução após corrigir os casos pendentes; os arquivos já migrados são verificados e ignorados.
