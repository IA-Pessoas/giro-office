import { useContext, useState } from "react";
import Head from "next/head";

import { canSSRGuest } from "@modules/auth";
import { AuthContext } from "../../context/AuthContext";
import { Button } from "../../shared/ui/newLayout/button";
import { Input } from "../../shared/ui/newLayout/input";

export default function Login() {
  const { signIn } = useContext(AuthContext);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    if (login === "" || password === "") return;

    await signIn({
      login,
      password,
    });
  }

  function handleKeyPress(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") handleLogin();
  }

  return (
    <>
      <Head>
        <title>Login - Castelo Workspace</title>
      </Head>

      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-sm p-8">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-sm font-bold text-white">CW</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-semibold">Castelo Workspace</span>
              <span className="text-sm text-muted-foreground">Acesse sua conta</span>
            </div>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Digite seu login"
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onKeyDown={handleKeyPress}
              autoComplete="username"
            />

            <Input
              placeholder="Digite sua senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyPress}
              autoComplete="current-password"
            />

            <Button className="w-full" onClick={handleLogin} type="button">
              Acessar
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// Verificação se esta logado
export const getServerSideProps = canSSRGuest(async(ctx) => {
    return {
        props: {

        }
    }
})