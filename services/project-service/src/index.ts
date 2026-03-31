import "dotenv/config";

import { createProjectApplication } from "./app.js";

const { app, logger, port } = createProjectApplication();

app.listen(port, () => {
  logger.info({ event: "server.start", data: { port } }, "project-service rodando");
});
