declare module "*swagger-ui-express/index.js" {
  const swaggerUi: {
    serve: import("express").RequestHandler[];
    setup: (...args: unknown[]) => import("express").RequestHandler;
  };

  export default swaggerUi;
}
