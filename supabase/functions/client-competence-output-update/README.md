# client-competence-output-update

Edge Function responsavel por disparar a rotina de competencia do `client-service`.

## Secrets esperados

- `CLIENT_SERVICE_BASE_URL`
- `CLIENT_SERVICE_INTERNAL_TOKEN`
- `EDGE_FUNCTION_SECRET` opcional

## Deploy

```bash
supabase functions deploy client-competence-output-update
```

## Agendamento sugerido

- Frequencia: diaria
- Hora: 07:00
- Timezone: `America/Sao_Paulo`
- Metodo: `POST`
- Header opcional: `Authorization: Bearer <EDGE_FUNCTION_SECRET>`
