import "dotenv/config";
import { serverError, serviceStart } from "@workspace/shared";
import http from "node:http";
import { app } from "./app.js";

const PORT = Number(process.env.PORT) || 3400;

const server = http.createServer(app);

server.listen(PORT, () => {
  serviceStart({ service: "organization-service", port: PORT });
});

server.on("error", (err) => {
  serverError("Erro no servidor organization-service", err);
});
