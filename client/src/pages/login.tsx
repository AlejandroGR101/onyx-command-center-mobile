import { useState } from "react";
import { useAuth } from "@/lib/authContext";
import { Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import marbleBg from "@assets/onyx-marble-bg.webp";
import onyxLogoWhite from "@assets/onyx-logo-white.png";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const success = await login(username, password);
    if (!success) {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col">
      {/* Full-bleed marble background — matches onyxrecordpress.com hero */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${marbleBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Subtle dark overlay for depth + readability */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Very subtle cyan ambient glow behind the login area */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[400px] opacity-[0.04]"
        style={{ background: "radial-gradient(ellipse, #00e5ff 0%, transparent 70%)" }}
      />

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4">

        {/* ── Hero branding area (mirrors website) ── */}
        <div className="text-center mb-10">
          {/* ONYX wordmark logo — the actual geometric logo from the site */}
          <img
            src={onyxLogoWhite}
            alt="ONYX"
            className="h-14 sm:h-16 mx-auto mb-3 select-none"
            draggable={false}
          />
          {/* "Record Press" subtitle — matching the website's style */}
          <p
            className="text-white/60 tracking-[0.35em] uppercase text-xs font-light"
            style={{ fontFamily: "'Lato', 'Open Sans', sans-serif" }}
          >
            Record Press
          </p>
        </div>

        {/* ── Divider line ── */}
        <div className="w-10 h-px bg-white/10 mb-8" />

        {/* ── Command Center badge ── */}
        <div className="mb-6">
          <span className="text-[10px] tracking-[0.25em] uppercase text-[#00e5ff]/50 font-semibold">
            Command Center
          </span>
        </div>

        {/* ── Login card ── */}
        <div className={`w-full max-w-sm ${shake ? "animate-shake" : ""}`}>
          <form onSubmit={handleSubmit}>
            <div
              className="rounded-2xl p-6 space-y-5"
              style={{
                background: "linear-gradient(180deg, rgba(12,12,16,0.75) 0%, rgba(8,8,12,0.85) 100%)",
                border: "1px solid rgba(255,255,255,0.07)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset",
                backdropFilter: "blur(20px)",
              }}
            >
              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#ff1744]/8 border border-[#ff1744]/15">
                  <AlertCircle className="w-3.5 h-3.5 text-[#ff1744] flex-shrink-0" />
                  <span className="text-xs text-[#ff1744]/80">Invalid credentials. Check username and password.</span>
                </div>
              )}

              {/* Username */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.15em] text-white/30 font-medium block">
                  Username
                </label>
                <input
                  data-testid="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(false); }}
                  placeholder="Enter username"
                  autoFocus
                  autoComplete="off"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#00e5ff]/30 focus:bg-white/[0.06] transition-all"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-[0.15em] text-white/30 font-medium block">
                  Password
                </label>
                <div className="relative">
                  <input
                    data-testid="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(false); }}
                    placeholder="Enter password"
                    autoComplete="off"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 pr-11 text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-[#00e5ff]/30 focus:bg-white/[0.06] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/20 hover:text-white/40 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                data-testid="login-submit"
                type="submit"
                disabled={!username || !password}
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden group"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                <span className="relative z-10 flex items-center justify-center gap-2 tracking-[0.08em] uppercase text-xs">
                  <Lock className="w-3.5 h-3.5" />
                  Access System
                </span>
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 100%)" }}
                />
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="text-center mt-6">
            <div className="text-[10px] text-white/15 tracking-wider uppercase">
              Arcadia, CA — Pheenix Alpha AD12
            </div>
          </div>
        </div>
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-4px); }
          30%, 70% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  );
}
