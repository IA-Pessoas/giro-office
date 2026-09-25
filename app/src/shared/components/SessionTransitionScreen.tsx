type SessionTransitionScreenProps = {
  title?: string;
  description?: string;
};

function OfficeMark() {
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-3xl bg-blue-500/30 blur-2xl" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 shadow-[0_18px_40px_rgba(37,99,235,0.35)]">
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="opacity-95"
        >
          <path d="M16 4L26 10V22L16 28L6 22V10L16 4Z" fill="#dbeafe" opacity="0.95" />
          <path d="M16 4L26 10L16 16V28L26 22V10L16 4Z" fill="#bfdbfe" opacity="0.85" />
          <path d="M16 4L6 10L16 16V28L6 22V10L16 4Z" fill="#93c5fd" opacity="0.65" />
        </svg>
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400 [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-300 [animation-delay:180ms]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-200 [animation-delay:360ms]" />
    </div>
  );
}

export function SessionTransitionScreen({
  title = "Sincronizando sessão",
  description = "Estamos preparando o ambiente com os dados mais recentes da sua conta.",
}: SessionTransitionScreenProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_transparent_38%),linear-gradient(180deg,_#020617_0%,_#0f172a_48%,_#111827_100%)] px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute bottom-[-5rem] right-[-2rem] h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute left-[-3rem] top-1/3 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.25) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      </div>

      <div className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-slate-950/72 p-8 shadow-[0_28px_80px_rgba(2,6,23,0.55)] backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <OfficeMark />

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-medium tracking-[0.18em] text-blue-100 uppercase">
            <LoadingDots />
            Office
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
            {title}
          </h1>

          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">
            {description}
          </p>

          <div className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-400 via-blue-300 to-cyan-200 animate-[session-load_1.4s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    </div>
  );
}
