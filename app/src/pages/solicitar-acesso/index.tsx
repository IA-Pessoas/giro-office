import Head from "next/head";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { canSSRGuest } from "@modules/auth";
import { OrganizationAccessRequestForm } from "@modules/organizations";

export default function SolicitarAcessoPage() {
  return (
    <>
      <Head>
        <title>Solicitar Acesso - Office</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-overlay filter blur-3xl opacity-70 animate-blob" />
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-400 rounded-full mix-blend-overlay filter blur-3xl opacity-70 animate-blob animation-delay-2000" />
          <div className="absolute -bottom-40 left-20 w-80 h-80 bg-blue-300 rounded-full mix-blend-overlay filter blur-3xl opacity-70 animate-blob animation-delay-4000" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20" />
        </div>

        <div className="w-full max-w-md relative z-10 animate-fade-in-right">
          <div className="flex justify-center mb-6">
            <Link
              href="/login"
              className="inline-flex items-center gap-3 bg-white rounded-2xl p-3 shadow-2xl hover:shadow-xl transition-shadow"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-xs font-bold text-white">OF</span>
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900">Office</span>
            </Link>
          </div>

          <div className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500 to-indigo-600 opacity-10 rounded-bl-full" />

            <div className="relative z-10">
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    Solicitar acesso
                  </h1>
                </div>
                <p className="text-gray-600 text-sm">Registre sua organização.</p>
              </div>

              <OrganizationAccessRequestForm />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = canSSRGuest(async () => {
  return { props: {} };
});
