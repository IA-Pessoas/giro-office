export const INTEGRACAO_QA_PASSWORD = "senha123";

function buildFixture({ organization, department, users, client, project, taskModel, task }) {
  const userByLevel = new Map(
    users.filter((user) => user.type === "user").map((user) => [user.level, user]),
  );
  const requiredUserAtLevel = (level) => {
    const user = userByLevel.get(level);
    if (!user) {
      throw new Error(`Fixture QA sem usuário nível ${level}.`);
    }
    return user;
  };

  return {
    organization,
    department,
    users,
    client: { ...client, organizationId: organization.id },
    project: { ...project, clientId: client.id, organizationId: organization.id },
    taskModel: { ...taskModel, departmentId: department.id, organizationId: organization.id },
    task: {
      ...task,
      clientId: client.id,
      projectId: project.id,
      modelId: taskModel.id,
      departmentId: department.id,
      responsibleId: requiredUserAtLevel(0).id,
      responsible2Id: requiredUserAtLevel(1).id,
      responsible3Id: requiredUserAtLevel(2).id,
      organizationId: organization.id,
    },
  };
}

export const INTEGRACAO_QA_FIXTURES = [
  buildFixture({
    organization: {
      id: "30000000-0000-4000-8000-000000000001",
      name: "QA Integração Alfa",
      slug: "qa-integracao-alfa",
      cnpj: "30000000000001",
      emailCreatedBy: "qa.alfa@example.com",
    },
    department: {
      id: "31000000-0000-4000-8000-000000000001",
      name: "QA Integração Alfa",
    },
    users: [
      {
        id: "32000000-0000-4000-8000-000000000001",
        name: "QA Alfa Nível 0",
        login: "qa.alfa.level0",
        type: "user",
        level: 0,
      },
      {
        id: "32000000-0000-4000-8000-000000000002",
        name: "QA Alfa Nível 1",
        login: "qa.alfa.level1",
        type: "user",
        level: 1,
      },
      {
        id: "32000000-0000-4000-8000-000000000003",
        name: "QA Alfa Nível 2",
        login: "qa.alfa.level2",
        type: "user",
        level: 2,
      },
      {
        id: "32000000-0000-4000-8000-000000000004",
        name: "QA Alfa Nível 3",
        login: "qa.alfa.level3",
        type: "user",
        level: 3,
      },
      {
        id: "32000000-0000-4000-8000-000000000005",
        name: "QA Alfa Owner",
        login: "qa.alfa.owner",
        type: "owner",
        level: 0,
      },
    ],
    client: {
      id: "34000000-0000-4000-8000-000000000001",
      name: "Cliente QA Alfa",
      cpfCnpj: "34000000000001",
    },
    project: {
      id: "35000000-0000-4000-8000-000000000001",
      name: "Projeto QA Alfa",
      percentage: 35,
    },
    taskModel: {
      id: "36000000-0000-4000-8000-000000000001",
      name: "Modelo QA Alfa",
    },
    task: {
      id: "37000000-0000-4000-8000-000000000001",
      name: "Dependência de exclusão QA Alfa",
    },
  }),
  buildFixture({
    organization: {
      id: "30000000-0000-4000-8000-000000000002",
      name: "QA Integração Beta",
      slug: "qa-integracao-beta",
      cnpj: "30000000000002",
      emailCreatedBy: "qa.beta@example.com",
    },
    department: {
      id: "31000000-0000-4000-8000-000000000002",
      name: "QA Integração Beta",
    },
    users: [
      {
        id: "33000000-0000-4000-8000-000000000001",
        name: "QA Beta Nível 0",
        login: "qa.beta.level0",
        type: "user",
        level: 0,
      },
      {
        id: "33000000-0000-4000-8000-000000000002",
        name: "QA Beta Nível 1",
        login: "qa.beta.level1",
        type: "user",
        level: 1,
      },
      {
        id: "33000000-0000-4000-8000-000000000003",
        name: "QA Beta Nível 2",
        login: "qa.beta.level2",
        type: "user",
        level: 2,
      },
      {
        id: "33000000-0000-4000-8000-000000000004",
        name: "QA Beta Nível 3",
        login: "qa.beta.level3",
        type: "user",
        level: 3,
      },
      {
        id: "33000000-0000-4000-8000-000000000005",
        name: "QA Beta Owner",
        login: "qa.beta.owner",
        type: "owner",
        level: 0,
      },
    ],
    client: {
      id: "34000000-0000-4000-8000-000000000002",
      name: "Cliente QA Beta",
      cpfCnpj: "34000000000002",
    },
    project: {
      id: "35000000-0000-4000-8000-000000000002",
      name: "Projeto QA Beta",
      percentage: 60,
    },
    taskModel: {
      id: "36000000-0000-4000-8000-000000000002",
      name: "Modelo QA Beta",
    },
    task: {
      id: "37000000-0000-4000-8000-000000000002",
      name: "Dependência de exclusão QA Beta",
    },
  }),
];
