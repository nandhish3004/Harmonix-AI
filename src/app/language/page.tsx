"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Globe, Check, Radio, Cpu, ArrowRight, Shield } from "lucide-react";
import { ChamferedCard } from "@/components/ui/ChamferedCard";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { createClient } from "@/utils/supabase/client";

interface LanguageOption {
  code: string;
  name: string;
  native: string;
  region: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", native: "English", region: "US / GLOBAL" },
  { code: "ta", name: "Tamil", native: "தமிழ்", region: "IND / LKA / SGP" },
  { code: "hi", name: "Hindi", native: "हिन्दी", region: "IN / SUB-CONTINENT" },
  { code: "de", name: "German", native: "Deutsch", region: "DE / DACH REGION" },
  { code: "ja", name: "Japanese", native: "日本語", region: "JP / APAC" },
];

export default function LanguageSelectionPage() {
  const router = useRouter();
  const [selectedLang, setSelectedLang] = useState<string>("en");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const saved = localStorage.getItem("harmonix_lang");
    if (saved) {
      setSelectedLang(saved);
    }
  }, []);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      localStorage.setItem("harmonix_lang", selectedLang);

      // Attempt to update Supabase profile if a session exists
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from("profiles")
          .update({ language_preference: selectedLang })
          .eq("id", user.id);
      }
    } catch (err) {
      console.warn("Locale preference cached locally.", err);
    } finally {
      setIsSubmitting(false);
      router.push("/auth");
    }
  };

  return (
    <div className="min-h-screen bg-[#0D191C] ar-grid-bg flex flex-col justify-between p-6">
      {/* Top Header telemetry */}
      <div className="space-y-6">
        <div className="flex items-center justify-between text-xs font-mono text-[#8C999A]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#0EB29A]" />
            <span className="tracking-widest text-[#0EB29A]">HARMONIX-AR OS</span>
          </div>
          <HudBadge variant="teal" dot>
            SYS.INIT // 00
          </HudBadge>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-5 h-5 text-[#0EB29A]" />
            <span className="text-xs font-mono tracking-widest text-[#8C999A] uppercase">
              LOCALIZATION PROTOCOL
            </span>
          </div>
          <h1 className="text-2xl font-bold font-mono tracking-tight text-[#F5FDFF]">
            SELECT SYSTEM LOCALE
          </h1>
          <p className="text-xs font-mono text-[#8C999A] mt-1">
            Calibrate AR telemetry readouts, acoustic diagnostics, and export templates for your deployment region.
          </p>
        </div>

        {/* 5 Selectable Language Pills */}
        <div className="space-y-3 pt-2">
          {LANGUAGES.map((lang) => {
            const isSelected = selectedLang === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => setSelectedLang(lang.code)}
                className="w-full text-left transition-all duration-200 focus:outline-none"
              >
                <ChamferedCard
                  variant={isSelected ? "active" : "default"}
                  className={`p-4 flex items-center justify-between cursor-pointer border ${
                    isSelected
                      ? "border-[#0EB29A] bg-[#1C332E] shadow-[0_0_15px_rgba(14,178,154,0.25)]"
                      : "border-[#294044] bg-[#15282C] hover:border-[#3E5556] hover:bg-[#183F3E]/40"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-[10px] flex items-center justify-center font-mono text-xs font-bold transition-colors ${
                        isSelected
                          ? "bg-[#0EB29A] text-[#0D191C]"
                          : "bg-[#233A3D] text-[#8C999A]"
                      }`}
                    >
                      {lang.code.toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#F5FDFF]">
                          {lang.name}
                        </span>
                        <span className="text-xs font-mono text-[#DDF0C2]">
                          ({lang.native})
                        </span>
                      </div>
                      <span className="text-[10px] font-mono tracking-wider text-[#8C999A]">
                        LOCALE: {lang.region}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                      isSelected
                        ? "border-[#0EB29A] bg-[#0EB29A] text-[#0D191C]"
                        : "border-[#294044] bg-[#101F23] text-transparent"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                </ChamferedCard>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom CTA Section */}
      <div className="pt-8 pb-4 space-y-4">
        <div className="flex items-center justify-between text-[11px] font-mono text-[#8C999A] px-1">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-[#0EB29A]" /> ISO-2859 NDT COMPLIANT
          </span>
          <span className="text-[#DDF0C2]">ACTIVE: {selectedLang.toUpperCase()}</span>
        </div>

        <HudButton
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          onClick={handleConfirm}
          className="flex items-center justify-center gap-2 group"
        >
          <span>CONFIRM SYSTEM LOCALE</span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </HudButton>
      </div>
    </div>
  );
}

