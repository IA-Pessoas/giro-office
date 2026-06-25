// src/components/users/UserProfile.tsx
import React, { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useRouter } from "next/router";
import { LuFolder } from "react-icons/lu";
import { FaComputer } from "react-icons/fa6";
import { IoCreate } from "react-icons/io5";

import { canAccessAdministration } from "@modules/auth";
import { useUserForm } from "../hooks/useUserForm";
import LogDrawer from "@shared/components/LogDrawer";
import { LoadingSpinner } from "@shared/components/LoadingSpinner";
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "@shared/components";

interface UserProfileProps {
  userId: string;
  me: any; // Dados do usuário logado
  departments: any[]; // Lista de departamentos para o Select
}

export function UserProfile({ userId, me, departments }: UserProfileProps) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const hasAdminAccess = canAccessAdministration(me);

  useEffect(() => {
    if (!hasAdminAccess) {
      void router.replace("/dashboard");
      return;
    }

    async function loadData() {
      try {
        setLoadingData(true);
        const { userService } = await import("../services/userService");
        const userData = await userService.getById(userId);
        setUser(userData);
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 403) {
          void router.replace("/dashboard");
          return;
        }

        console.error("Erro ao carregar usuário", error);
      } finally {
        setLoadingData(false);
      }
    }

    if (userId) {
      void loadData();
    }
  }, [hasAdminAccess, router, userId]);

  if (!hasAdminAccess) {
    return null;
  }

  if (loadingData || !user) {
    return <LoadingSpinner />;
  }

  return <UserFormContent user={user} me={me} departments={departments} />;
}

// Separamos o formulário para garantir que o hook useUserForm só inicie quando "user" existir
function UserFormContent({ user, me, departments }) {
  const {
    formData,
    isLoading,
    handleInputChange,
    handleFileChange,
    handleUpdate,
  } = useUserForm(user);

  const permissoes = [
    { id: 0, nome: "Normal" },
    { id: 1, nome: "Sub-Administrador" },
    { id: 2, nome: "Administrador" },
  ];

  return (
    <TabsRoot defaultValue="dados">
      <TabsList>
        <TabsTrigger value="dados">
          <span className="inline-flex items-center gap-2">
            <LuFolder /> Dados
          </span>
        </TabsTrigger>
        <TabsTrigger value="inventario">
          <span className="inline-flex items-center gap-2">
            <FaComputer /> Inventário
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dados">
        <div className="mx-auto flex w-full max-w-[900px] flex-col items-center pb-8 pt-4">
          <label htmlFor="photo-upload">
            <img
              src={formData.photoUrl || "/logos/lions/Grey.png"}
              alt="Foto do usuário"
              className="mb-4 h-[120px] w-[120px] cursor-pointer rounded-full border-2 border-slate-200 object-cover transition-opacity hover:opacity-80"
            />
          </label>
          <input
            id="photo-upload"
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />

          <form
            className="u-stack u-gap-4 w-full"
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdate();
            }}
          >
            <div className="u-responsive-3cols">
              <div className="u-stack u-gap-2">
                <label className="users-section-title">Login</label>
                <input value={user?.login || ""} readOnly className="ui-input bg-slate-100" />
              </div>
              <div className="u-stack u-gap-2">
                <label className="users-section-title">Nome</label>
                <input
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="ui-input"
                />
              </div>
              <div className="u-stack u-gap-2">
                <label className="users-section-title">Nova Senha</label>
                <input
                  type="password"
                  name="password"
                  placeholder="Deixe em branco para manter"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="ui-input"
                />
              </div>
            </div>

            <div className="u-responsive-3cols">
              <div className="u-stack u-gap-2">
                <label className="users-section-title">Departamento</label>
                <select
                  name="department_id"
                  value={formData.department_id}
                  onChange={handleInputChange}
                  className="ui-input"
                >
                  {departments.map((dep) => (
                    <option key={dep.id} value={dep.id}>
                      {dep.name}
                    </option>
                  ))}
                </select>
              </div>

              {me.permission >= 1 && (
                <>
                  <div className="u-stack u-gap-2">
                    <label className="users-section-title">Permissao</label>
                    <select
                      name="permission"
                      value={formData.permission}
                      onChange={handleInputChange}
                      className="ui-input"
                    >
                      {permissoes
                        .filter((p) => p.id <= me.permission)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="u-stack u-gap-2">
                    <label className="users-section-title">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="ui-input"
                    >
                      <option value="Ativo">Ativo</option>
                      <option value="Inativo">Inativo</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="u-flex u-justify-between u-items-center mt-6">
              <LogDrawer referring="users" referringId={user.id} />
              <button type="submit" className="ui-button-primary" disabled={isLoading}>
                <IoCreate />
                {isLoading ? "Salvando..." : "Salvar Alteracoes"}
              </button>
            </div>
          </form>
        </div>
      </TabsContent>
      <TabsContent value="inventario">
        <p>Inventario aqui...</p>
      </TabsContent>
    </TabsRoot>
  );
}
