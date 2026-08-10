import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import express from "express";
import request from "supertest";

import {
  MAX_CHAT_MEDIA_FILE_SIZE_BYTES,
  uploadChatMedia,
} from "../middlewares/uploadChatMedia.js";

describe("uploadChatMedia middleware", () => {
  it("rejects files larger than 10 MB before handler runs", async () => {
    const handler = mock.fn((_request, response) => {
      response.status(200).json({ fileUrl: "should-not-reach" });
    });

    const app = express();
    app.post("/chat/media", uploadChatMedia, handler);

    const oversized = Buffer.alloc(MAX_CHAT_MEDIA_FILE_SIZE_BYTES + 1, 1);

    const response = await request(app)
      .post("/chat/media")
      .attach("file", oversized, "large.bin");

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "Arquivo excede o limite de 10 MB." });
    assert.equal(handler.mock.callCount(), 0);
  });

  it("allows files under 10 MB to reach handler", async () => {
    const handler = mock.fn((_request, response) => {
      response.status(200).json({ fileUrl: "ok" });
    });

    const app = express();
    app.post("/chat/media", uploadChatMedia, handler);

    const valid = Buffer.alloc(1024, 1);

    const response = await request(app)
      .post("/chat/media")
      .attach("file", valid, "small.bin");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { fileUrl: "ok" });
    assert.equal(handler.mock.callCount(), 1);
  });

  it("rejects unexpected upload fields before handler runs", async () => {
    const handler = mock.fn((_request, response) => {
      response.status(200).json({ fileUrl: "should-not-reach" });
    });

    const app = express();
    app.post("/chat/media", uploadChatMedia, handler);

    const valid = Buffer.alloc(1024, 1);

    const response = await request(app)
      .post("/chat/media")
      .attach("unexpected", valid, "small.bin");

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "Upload de mídia inválido." });
    assert.equal(handler.mock.callCount(), 0);
  });
});
