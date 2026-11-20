"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, ShieldAlert, ArrowRight, KeyRound, CheckCircle2, User } from "lucide-react";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { HarmonixLogo, triggerHarmonixSplash } from "@/components/ui/HarmonixLogo";
import { createClient } from "@/utils/supabase/client";

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);

  const supabase = createClient();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Basic inline validation
    if (!email || !email.includes("@")) {
      setErrorMsg("Please provide a valid enterprise email address.");
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg("Password must contain at least 6 characters.");
      return;
    }

    setIsLoading(true);

    try {
      if (tab === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        if (data.session) {
          router.push("/scan");
        }
      } else {
        const savedLang = typeof window !== "undefined" ? localStorage.getItem("harmonix_lang") || "en" : "en";
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || email.split("@")[0],
              language_preference: savedLang,
            },
          },
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        if (data.session) {
          router.push("/scan");
        } else {
          setSuccessMsg("Account registered. Check your email for verification confirmation or sign in directly.");
          setTab("signin");
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected authentication error occurred.";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setErrorMsg(error.message);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google OAuth initiation failed.";
      setErrorMsg(message);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0D191C] ar-grid-bg flex flex-col justify-between p-6 transition-colors duration-200">
      {/* Top HUD Branding */}
      <div className="space-y-6">
        <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-[#8C999A]">
          <button
            type="button"
            onClick={triggerHarmonixSplash}
            title="Replay Harmonix Intro Animation"
            className="flex items-center gap-2.5 text-left"
          >
            <HarmonixLogo size="md" />
            <div>
              <span className="block tracking-widest text-slate-900 dark:text-[#F5FDFF] font-extrabold">
                SECURITY GATEWAY
              </span>
              <span className="block text-[9px] tracking-wider text-sky-600 dark:text-[#0EB29A]">
                HARMONIX-AR STUDIO
              </span>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <HudBadge variant="teal" dot>
              SYS.AUTH // 00b
            </HudBadge>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-[#F5FDFF]">
            HARMONIX-AR ACCESS
          </h1>
          <p className="text-xs font-mono text-slate-600 dark:text-[#8C999A] mt-1">
            Authenticate to sync workpiece point-clouds, vibration scans, and defect logs.
          </p>
        </div>

        {/* Tab Switcher: [SIGN IN] | [REGISTER] */}
        <div className="bg-slate-200/80 dark:bg-[#101F23] p-1 rounded-[12px] border border-slate-200 dark:border-[#294044] grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => {
              setTab("signin");
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-mono font-bold uppercase rounded-[10px] transition-all ${
              tab === "signin"
                ? "bg-white text-slate-900 shadow-sm dark:bg-[#0EB29A] dark:text-[#0D191C] dark:shadow-[0_0_12px_rgba(14,178,154,0.3)]"
                : "text-slate-600 dark:text-[#8C999A] hover:text-slate-900 dark:hover:text-[#F5FDFF]"
            }`}
          >
            SIGN IN
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("register");
              setErrorMsg(null);
            }}
            className={`py-2 text-xs font-mono font-bold uppercase rounded-[10px] transition-all ${
              tab === "register"
                ? "bg-white text-slate-900 shadow-sm dark:bg-[#0EB29A] dark:text-[#0D191C] dark:shadow-[0_0_12px_rgba(14,178,154,0.3)]"
                : "text-slate-600 dark:text-[#8C999A] hover:text-slate-900 dark:hover:text-[#F5FDFF]"
            }`}
          >
            REGISTER
          </button>
        </div>

        {/* Google Enterprise OAuth Trigger */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
          className="w-full bg-white dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] hover:border-sky-500 dark:hover:border-[#0EB29A] hover:bg-slate-50 dark:hover:bg-[#1C332E] text-slate-800 dark:text-[#F5FDFF] rounded-[12px] py-3.5 px-4 font-mono text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-sm"
        >
          {/* Standard Google SVG Icon */}
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>
            {isGoogleLoading ? "CONNECTING GOOGLE..." : "CONTINUE WITH GOOGLE ENTERPRISE"}
          </span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="border-t border-slate-200 dark:border-[#294044] w-full" />
          <span className="bg-slate-50 dark:bg-[#0D191C] px-3 font-mono text-[10px] tracking-widest text-slate-500 dark:text-[#8C999A] uppercase">
            OR OPERATOR CREDENTIALS
          </span>
        </div>

        {/* Error / Success Toast Callout */}
        {errorMsg && (
          <div className="p-3.5 bg-red-50 border border-red-200 dark:bg-[#2D0A0A] dark:border-[#FF4444]/60 rounded-[12px] flex items-start gap-3 text-xs font-mono text-red-800 dark:text-[#FF8888] animate-in fade-in">
            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-[#FF4444] shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold uppercase tracking-wider block text-red-700 dark:text-[#FF4444]">
                AUTH EXCEPTION
              </span>
              <span>{errorMsg}</span>
            </div>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 dark:bg-[#0D2B1A] dark:border-[#4ADE80]/60 rounded-[12px] flex items-start gap-3 text-xs font-mono text-emerald-800 dark:text-[#DDF0C2] animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#4ADE80] shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold uppercase tracking-wider block text-emerald-700 dark:text-[#4ADE80]">
                REGISTRATION PENDING
              </span>
              <span>{successMsg}</span>
            </div>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {tab === "register" && (
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono tracking-wider text-slate-600 dark:text-[#8C999A] uppercase font-semibold">
                OPERATOR FULL NAME
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-[#8C999A]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Helena Vance"
                  className="w-full bg-white dark:bg-[#15282C] border border-slate-300 dark:border-[#294044] focus:border-sky-600 dark:focus:border-[#0EB29A] text-slate-900 dark:text-[#F5FDFF] placeholder-slate-400 dark:placeholder-[#8C999A]/50 rounded-[12px] pl-10 pr-4 py-3 font-mono text-xs focus:outline-none transition-colors shadow-xs"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono tracking-wider text-slate-600 dark:text-[#8C999A] uppercase font-semibold">
              WORK EMAIL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-[#8C999A]">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@acoustics-lab.internal"
                className="w-full bg-white dark:bg-[#15282C] border border-slate-300 dark:border-[#294044] focus:border-sky-600 dark:focus:border-[#0EB29A] text-slate-900 dark:text-[#F5FDFF] placeholder-slate-400 dark:placeholder-[#8C999A]/50 rounded-[12px] pl-10 pr-4 py-3 font-mono text-xs focus:outline-none transition-colors shadow-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-mono tracking-wider text-slate-600 dark:text-[#8C999A] uppercase font-semibold">
                SECURITY CIPHER (PASSWORD)
              </label>
              {tab === "signin" && (
                <span className="text-[10px] font-mono text-sky-600 dark:text-[#0EB29A] cursor-pointer hover:underline font-semibold">
                  FORGOT CIPHER?
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-[#8C999A]">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white dark:bg-[#15282C] border border-slate-300 dark:border-[#294044] focus:border-sky-600 dark:focus:border-[#0EB29A] text-slate-900 dark:text-[#F5FDFF] placeholder-slate-400 dark:placeholder-[#8C999A]/50 rounded-[12px] pl-10 pr-4 py-3 font-mono text-xs focus:outline-none transition-colors shadow-xs"
              />
            </div>
          </div>

          <HudButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            className="mt-2"
          >
            <span>{tab === "signin" ? "AUTHENTICATE SESSION →" : "CREATE OPERATOR ACCOUNT →"}</span>
          </HudButton>
        </form>
      </div>

      {/* Footer Info */}
      <div className="pt-6 pb-2 text-center">
        <p className="text-[10px] font-mono text-slate-500 dark:text-[#8C999A]">
          ENCRYPTED VIA AES-GCM-256 // SUPABASE ROW LEVEL SECURITY ACTIVE
        </p>
      </div>
    </div>
  );
}
