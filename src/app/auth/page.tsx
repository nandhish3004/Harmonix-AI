"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, KeyRound, User } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextInput } from "@astryxdesign/core/TextInput";
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
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-[#F5FDFF]">
            {tab === "signin" ? "Sign in to HARMONIX-AR" : "Create your HARMONIX-AR account"}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#8C999A] mt-1 leading-relaxed">
            Sync your workpiece scans, vibration profiles, and defect logs across devices.
          </p>
        </div>

        {/* Astryx SegmentedControl: Sign In | Register */}
        <SegmentedControl
          label="Authentication mode"
          value={tab}
          onChange={(val: string) => {
            setTab(val as "signin" | "register");
            setErrorMsg(null);
          }}
          layout="fill"
          size="md"
        >
          <SegmentedControlItem value="signin" label="Sign In" />
          <SegmentedControlItem value="register" label="Create Account" />
        </SegmentedControl>

        {/* Google Enterprise OAuth Trigger */}
        <Button
          variant="secondary"
          size="lg"
          width="100%"
          label={isGoogleLoading ? "Connecting Google..." : "Continue with Google"}
          isLoading={isGoogleLoading}
          onClick={handleGoogleSignIn}
          className="bg-white dark:bg-[#15282C] border border-slate-200 dark:border-[#294044] text-slate-800 dark:text-[#F5FDFF] font-semibold"
        >
          <span className="flex items-center justify-center gap-2.5">
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
            <span>{isGoogleLoading ? "Connecting Google..." : "Continue with Google"}</span>
          </span>
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-[#294044]" />
          <span className="font-mono text-[10px] tracking-widest text-slate-500 dark:text-[#8C999A] uppercase whitespace-nowrap">
            OR OPERATOR CREDENTIALS
          </span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-[#294044]" />
        </div>

        {/* Error / Success Astryx Banners */}
        {errorMsg && (
          <Banner
            status="error"
            title="Authentication Error"
            description={errorMsg}
            isDismissable
            onDismiss={() => setErrorMsg(null)}
          />
        )}

        {successMsg && (
          <Banner
            status="success"
            title="Registration Pending"
            description={successMsg}
            isDismissable
            onDismiss={() => setSuccessMsg(null)}
          />
        )}

        {/* Email & Password Form (Astryx TextInput size="lg") */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          {tab === "register" && (
            <TextInput
              type="text"
              label="Full Name"
              size="lg"
              width="100%"
              isRequired
              hasClear
              value={fullName}
              onChange={(val: string) => setFullName(val)}
              placeholder="Dr. Helena Vance"
              startIcon={<User className="w-4 h-4" />}
            />
          )}

          <TextInput
            type="email"
            label="Work Email"
            size="lg"
            width="100%"
            isRequired
            hasClear
            value={email}
            onChange={(val: string) => setEmail(val)}
            placeholder="operator@acoustics-lab.internal"
            startIcon={<Mail className="w-4 h-4" />}
          />

          <TextInput
            type="password"
            label="Password"
            size="lg"
            width="100%"
            isRequired
            description={tab === "signin" ? "Minimum 6 characters" : "Choose a password with at least 6 characters"}
            value={password}
            onChange={(val: string) => setPassword(val)}
            placeholder="••••••••••••"
            startIcon={<KeyRound className="w-4 h-4" />}
          />

          <HudButton
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            className="mt-2"
          >
            <span>{tab === "signin" ? "Sign In →" : "Create Account →"}</span>
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
