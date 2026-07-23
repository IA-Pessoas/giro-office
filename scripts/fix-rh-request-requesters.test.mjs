import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRequesterCorrectionPlan,
  parseLegacyInsertDump,
  requestIdForLegacyRhRequest,
  userIdForLegacyAdminUser,
} from "./fix-rh-request-requesters.mjs";

test("buildRequesterCorrectionPlan resolves request requester through legacy collaborator", () => {
  const requestId = requestIdForLegacyRhRequest(174);
  const wrongRequesterUserId = userIdForLegacyAdminUser(145);
  const expectedRequesterUserId = userIdForLegacyAdminUser(105);

  const plan = buildRequesterCorrectionPlan({
    legacyRequests: [{ id: 174, titulo: "Cirurgia", requerente: 145 }],
    legacyCollaborators: [
      { id: 145, user_id: 105, nome: "Hosana Jennifer Souza Palmeira" },
      { id: 174, user_id: 144, nome: "Mara Emilia" },
    ],
    currentRequests: [
      {
        id: requestId,
        title: "Cirurgia",
        requester_user_id: wrongRequesterUserId,
      },
    ],
    currentUsers: [
      { id: wrongRequesterUserId, name: "Islaine Souza", login: "Islaine" },
      { id: expectedRequesterUserId, name: "Hosana Jennifer Souza Palmeira", login: "Hosana" },
    ],
  });

  assert.equal(plan.summary.corrections, 1);
  assert.equal(plan.corrections[0].requestId, requestId);
  assert.equal(plan.corrections[0].legacyRequesterCollaboratorId, "145");
  assert.equal(plan.corrections[0].legacyRequesterUserId, "105");
  assert.equal(plan.corrections[0].currentRequesterUserId, wrongRequesterUserId);
  assert.equal(plan.corrections[0].expectedRequesterUserId, expectedRequesterUserId);
  assert.equal(plan.corrections[0].expectedRequesterName, "Hosana Jennifer Souza Palmeira");
});

test("parseLegacyInsertDump parses SQL dump rows with commas inside text", () => {
  const rows = parseLegacyInsertDump(`
INSERT INTO \`tb_rh.solicitacoes\` (\`id\`, \`titulo\`, \`descricao\`, \`requerente\`) VALUES
(174, 'Cirurgia, dia 10', 'Texto com ; no meio', 145),
(175, 'Outra', NULL, 146);
`);

  assert.deepEqual(rows, [
    {
      id: "174",
      titulo: "Cirurgia, dia 10",
      descricao: "Texto com ; no meio",
      requerente: "145",
    },
    {
      id: "175",
      titulo: "Outra",
      descricao: null,
      requerente: "146",
    },
  ]);
});
