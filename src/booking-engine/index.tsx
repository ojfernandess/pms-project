/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";

// Declaração de tipos para Chatwoot SDK
declare global {
  interface Window {
    chatwootSDK?: {
      run: (config: { websiteToken: string; baseUrl: string }) => void;
    };
  }
}
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CalendarDays, Users, Percent, Search, Star, Crown, Sparkles, MapPin, CheckCircle2, Phone, Mail, MessageCircle, Globe2, Instagram, Facebook, Twitter, Youtube, ArrowRight, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/booking-engine/DateRangePicker";

// Animações CSS inline via style tag
const animationStyles = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  .animate-fade-in {
    animation: fadeIn 0.6s ease-out forwards;
  }
  
  .animate-fade-in-up {
    animation: fadeInUp 0.8s ease-out forwards;
  }
  
  .animate-fade-in-delay {
    animation: fadeIn 0.8s ease-out 0.2s forwards;
    opacity: 0;
  }
  
  .animate-fade-in-up-delay {
    animation: fadeInUp 0.8s ease-out 0.3s forwards;
    opacity: 0;
  }
  
  .animate-slide-in-right {
    animation: slideInRight 0.6s ease-out forwards;
  }
`;

type BookingThemeKey = "default" | "modern" | "luxury" | "minimal" | "dark" | "travel";

interface BookingThemeConfig {
  // Page & Layout
  pageBg: string;
  heroBg: string;
  heroOverlay: string;
  heroImageOverlay: string;
  
  // Header
  headerBg: string;
  headerText: string;
  headerSubtitle: string;
  headerButton: string;
  headerBorder?: string;
  
  // Hero Section
  heroTitle: string;
  heroSubtitle: string;
  heroTitleSize: string;
  heroSubtitleSize: string;
  
  // Search Card
  searchCard: string;
  searchCardShadow: string;
  searchCardBorder: string;
  searchInputBg: string;
  searchInputBorder: string;
  searchInputText: string;
  searchInputFocus: string;
  
  // Buttons
  primaryButton: string;
  primaryButtonHover: string;
  secondaryButton: string;
  secondaryButtonHover: string;
  
  // Typography
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  
  // Cards
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  cardHover: string;
  cardHoverShadow: string;
  
  // Room Cards
  roomCardBg: string;
  roomCardBorder: string;
  roomCardShadow: string;
  roomImageOverlay?: string;
  
  // Pricing
  priceColor: string;
  priceLabel: string;
  priceHighlight: string;
  
  // Badges
  badgePrimary: string;
  badgeSecondary: string;
  badgeSuccess: string;
  badgeWarning: string;
  
  // Summary Sidebar
  summaryBg: string;
  summaryBorder: string;
  summaryShadow: string;
  
  // Accents
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  
  // Plan Cards
  planCardBg: string;
  planCardBorder: string;
  planCardSelected: string;
  planCardHover: string;
  
  // Footer
  footerBg: string;
  footerBorder: string;
  footerText: string;
}

const THEME_CONFIGS: Record<BookingThemeKey, BookingThemeConfig> = {
  default: {
    // Clean Blue & White Theme
    pageBg: "bg-slate-50",
    heroBg: "bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700",
    heroOverlay: "bg-black/20",
    heroImageOverlay: "bg-gradient-to-t from-black/60 via-black/20 to-transparent",
    
    headerBg: "bg-white",
    headerText: "text-slate-900",
    headerSubtitle: "text-slate-500",
    headerButton: "bg-blue-600 hover:bg-blue-700 text-white",
    headerBorder: "border-b border-slate-200",
    
    heroTitle: "text-white",
    heroSubtitle: "text-blue-50",
    heroTitleSize: "text-4xl md:text-5xl lg:text-6xl",
    heroSubtitleSize: "text-base md:text-lg",
    
    searchCard: "bg-white",
    searchCardShadow: "shadow-2xl",
    searchCardBorder: "border-0",
    searchInputBg: "bg-slate-50",
    searchInputBorder: "border-slate-200",
    searchInputText: "text-slate-900",
    searchInputFocus: "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
    
    primaryButton: "bg-blue-600 text-white",
    primaryButtonHover: "hover:bg-blue-700 hover:shadow-lg",
    secondaryButton: "bg-white text-blue-600 border border-blue-600",
    secondaryButtonHover: "hover:bg-blue-50",
    
    textPrimary: "text-slate-900",
    textSecondary: "text-slate-700",
    textMuted: "text-slate-500",
    textInverse: "text-white",
    
    cardBg: "bg-white",
    cardBorder: "border border-slate-200",
    cardShadow: "shadow-sm",
    cardHover: "hover:border-blue-300",
    cardHoverShadow: "hover:shadow-lg",
    
    roomCardBg: "bg-white",
    roomCardBorder: "border border-slate-200",
    roomCardShadow: "shadow-md",
    roomImageOverlay: "bg-gradient-to-t from-black/40 to-transparent",
    
    priceColor: "text-blue-600",
    priceLabel: "text-slate-500",
    priceHighlight: "text-blue-700 font-bold",
    
    badgePrimary: "bg-blue-100 text-blue-700 border-blue-200",
    badgeSecondary: "bg-slate-100 text-slate-700 border-slate-200",
    badgeSuccess: "bg-green-100 text-green-700 border-green-200",
    badgeWarning: "bg-amber-100 text-amber-700 border-amber-200",
    
    summaryBg: "bg-white",
    summaryBorder: "border border-slate-200",
    summaryShadow: "shadow-lg",
    
    accentColor: "text-blue-600",
    accentBg: "bg-blue-50",
    accentBorder: "border-blue-200",
    
    planCardBg: "bg-white",
    planCardBorder: "border border-slate-200",
    planCardSelected: "border-2 border-blue-500 bg-blue-50",
    planCardHover: "hover:border-blue-300 hover:shadow-md",
    
    footerBg: "bg-white",
    footerBorder: "border-t border-slate-200",
    footerText: "text-slate-600",
  },
  modern: {
    // Modern Gradient & Glassmorphism
    pageBg: "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950",
    heroBg: "bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-red-500/20",
    heroOverlay: "bg-black/50",
    heroImageOverlay: "bg-gradient-to-t from-black/80 via-black/40 to-transparent",
    
    headerBg: "bg-slate-900/80 backdrop-blur-md",
    headerText: "text-white",
    headerSubtitle: "text-slate-300",
    headerButton: "bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold",
    headerBorder: "border-b border-slate-700/50",
    
    heroTitle: "text-white",
    heroSubtitle: "text-slate-200",
    heroTitleSize: "text-4xl md:text-5xl lg:text-6xl",
    heroSubtitleSize: "text-base md:text-lg",
    
    searchCard: "bg-slate-800/90 backdrop-blur-xl",
    searchCardShadow: "shadow-2xl shadow-black/50",
    searchCardBorder: "border border-slate-700/50",
    searchInputBg: "bg-slate-700/50",
    searchInputBorder: "border-slate-600",
    searchInputText: "text-white",
    searchInputFocus: "focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30",
    
    primaryButton: "bg-amber-500 text-slate-900",
    primaryButtonHover: "hover:bg-amber-600 hover:shadow-xl hover:shadow-amber-500/30",
    secondaryButton: "bg-slate-800 text-amber-400 border border-amber-500",
    secondaryButtonHover: "hover:bg-slate-700",
    
    textPrimary: "text-white",
    textSecondary: "text-slate-200",
    textMuted: "text-slate-400",
    textInverse: "text-slate-900",
    
    cardBg: "bg-slate-800/90 backdrop-blur",
    cardBorder: "border border-slate-700",
    cardShadow: "shadow-xl shadow-black/30",
    cardHover: "hover:border-amber-500/50",
    cardHoverShadow: "hover:shadow-2xl hover:shadow-amber-500/20",
    
    roomCardBg: "bg-slate-800/90 backdrop-blur",
    roomCardBorder: "border border-slate-700",
    roomCardShadow: "shadow-xl",
    roomImageOverlay: "bg-gradient-to-t from-black/70 via-black/30 to-transparent",
    
    priceColor: "text-amber-400",
    priceLabel: "text-slate-400",
    priceHighlight: "text-amber-300 font-bold",
    
    badgePrimary: "bg-amber-500/20 text-amber-300 border-amber-500/50",
    badgeSecondary: "bg-slate-700/50 text-slate-300 border-slate-600",
    badgeSuccess: "bg-green-500/20 text-green-300 border-green-500/50",
    badgeWarning: "bg-orange-500/20 text-orange-300 border-orange-500/50",
    
    summaryBg: "bg-slate-800/95 backdrop-blur-xl",
    summaryBorder: "border border-slate-700",
    summaryShadow: "shadow-2xl shadow-black/50",
    
    accentColor: "text-amber-400",
    accentBg: "bg-amber-500/10",
    accentBorder: "border-amber-500/30",
    
    planCardBg: "bg-slate-800/80",
    planCardBorder: "border border-slate-700",
    planCardSelected: "border-2 border-amber-500 bg-amber-500/10",
    planCardHover: "hover:border-amber-500/50 hover:shadow-lg",
    
    footerBg: "bg-slate-900/80 backdrop-blur-md",
    footerBorder: "border-t border-slate-700",
    footerText: "text-slate-300",
  },
  luxury: {
    // Luxury Purple & Gold - Elegant & Professional with High Readability
    pageBg: "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950",
    heroBg: "bg-gradient-to-br from-purple-900/50 via-slate-900/70 to-slate-950",
    heroOverlay: "bg-black/50",
    heroImageOverlay: "bg-gradient-to-t from-black/85 via-purple-900/30 to-transparent",
    
    headerBg: "bg-slate-950/98 backdrop-blur-md",
    headerText: "text-slate-50",
    headerSubtitle: "text-slate-300",
    headerButton: "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold shadow-lg shadow-purple-900/30",
    headerBorder: "border-b border-slate-800/50",
    
    heroTitle: "text-white font-serif drop-shadow-lg",
    heroSubtitle: "text-slate-100",
    heroTitleSize: "text-5xl md:text-6xl lg:text-7xl",
    heroSubtitleSize: "text-lg md:text-xl",
    
    // Card de busca (check-in/checkout) mais sólido e com menos transparência
    searchCard: "bg-slate-900 border border-slate-800 shadow-2xl",
    searchCardShadow: "shadow-2xl shadow-black/60",
    searchCardBorder: "border border-slate-800",
    searchInputBg: "bg-slate-800",
    searchInputBorder: "border-slate-700",
    searchInputText: "text-slate-50",
    searchInputFocus: "focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30",
    
    primaryButton: "bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold shadow-lg",
    primaryButtonHover: "hover:from-purple-700 hover:to-purple-800 hover:shadow-xl hover:shadow-purple-500/40",
    secondaryButton: "bg-slate-800/90 text-slate-100 border border-slate-700/50",
    secondaryButtonHover: "hover:bg-slate-700/90 hover:border-purple-500/50",
    
    textPrimary: "text-slate-50",
    textSecondary: "text-slate-200",
    textMuted: "text-slate-400",
    textInverse: "text-slate-900",
    
    cardBg: "bg-slate-900/95 backdrop-blur-sm",
    cardBorder: "border border-slate-800/50",
    cardShadow: "shadow-xl shadow-black/40",
    cardHover: "hover:border-purple-500/60",
    cardHoverShadow: "hover:shadow-2xl hover:shadow-purple-900/30",
    
    roomCardBg: "bg-slate-900/95 backdrop-blur-sm",
    roomCardBorder: "border border-slate-800/50",
    roomCardShadow: "shadow-xl shadow-black/40",
    roomImageOverlay: "bg-gradient-to-t from-black/85 via-slate-900/40 to-transparent",
    
    priceColor: "text-purple-300",
    priceLabel: "text-slate-400",
    priceHighlight: "text-purple-200 font-bold",
    
    badgePrimary: "bg-purple-500/25 text-purple-200 border-purple-500/50",
    badgeSecondary: "bg-slate-800/70 text-slate-200 border-slate-700/50",
    badgeSuccess: "bg-emerald-500/25 text-emerald-200 border-emerald-500/50",
    badgeWarning: "bg-amber-500/25 text-amber-200 border-amber-500/50",
    
    summaryBg: "bg-slate-900/98 backdrop-blur-xl",
    summaryBorder: "border border-slate-800/50",
    summaryShadow: "shadow-2xl shadow-black/50",
    
    accentColor: "text-purple-300",
    accentBg: "bg-purple-500/15",
    accentBorder: "border-purple-500/40",
    
    planCardBg: "bg-slate-900/90",
    planCardBorder: "border border-slate-800/50",
    planCardSelected: "border-2 border-purple-500 bg-purple-500/15",
    planCardHover: "hover:border-purple-500/60 hover:shadow-lg",
    
    footerBg: "bg-slate-950/98 backdrop-blur-md",
    footerBorder: "border-t border-slate-800/50",
    footerText: "text-slate-300",
  },
  minimal: {
    // Minimal Clean White
    pageBg: "bg-white",
    heroBg: "bg-gradient-to-br from-slate-50 to-white",
    heroOverlay: "",
    heroImageOverlay: "bg-gradient-to-t from-white/90 via-white/50 to-transparent",
    
    headerBg: "bg-white",
    headerText: "text-slate-900",
    headerSubtitle: "text-slate-500",
    headerButton: "bg-slate-900 hover:bg-slate-800 text-white",
    headerBorder: "border-b border-slate-100",
    
    heroTitle: "text-slate-900",
    heroSubtitle: "text-slate-600",
    heroTitleSize: "text-4xl md:text-5xl lg:text-6xl",
    heroSubtitleSize: "text-base md:text-lg",
    
    searchCard: "bg-white",
    searchCardShadow: "shadow-lg",
    searchCardBorder: "border border-slate-200",
    searchInputBg: "bg-white",
    searchInputBorder: "border-slate-200",
    searchInputText: "text-slate-900",
    searchInputFocus: "focus:border-slate-400 focus:ring-1 focus:ring-slate-400/20",
    
    primaryButton: "bg-slate-900 text-white",
    primaryButtonHover: "hover:bg-slate-800 hover:shadow-md",
    secondaryButton: "bg-white text-slate-900 border border-slate-300",
    secondaryButtonHover: "hover:bg-slate-50",
    
    textPrimary: "text-slate-900",
    textSecondary: "text-slate-700",
    textMuted: "text-slate-500",
    textInverse: "text-white",
    
    cardBg: "bg-white",
    cardBorder: "border border-slate-100",
    cardShadow: "shadow-sm",
    cardHover: "hover:border-slate-300",
    cardHoverShadow: "hover:shadow-md",
    
    roomCardBg: "bg-white",
    roomCardBorder: "border border-slate-100",
    roomCardShadow: "shadow-sm",
    roomImageOverlay: "bg-gradient-to-t from-white/80 to-transparent",
    
    priceColor: "text-slate-900",
    priceLabel: "text-slate-500",
    priceHighlight: "text-slate-900 font-bold",
    
    badgePrimary: "bg-slate-100 text-slate-700 border-slate-200",
    badgeSecondary: "bg-slate-50 text-slate-600 border-slate-200",
    badgeSuccess: "bg-green-50 text-green-700 border-green-200",
    badgeWarning: "bg-amber-50 text-amber-700 border-amber-200",
    
    summaryBg: "bg-white",
    summaryBorder: "border border-slate-200",
    summaryShadow: "shadow-lg",
    
    accentColor: "text-slate-900",
    accentBg: "bg-slate-50",
    accentBorder: "border-slate-200",
    
    planCardBg: "bg-white",
    planCardBorder: "border border-slate-200",
    planCardSelected: "border-2 border-slate-900 bg-slate-50",
    planCardHover: "hover:border-slate-400 hover:shadow-sm",
    
    footerBg: "bg-white",
    footerBorder: "border-t border-slate-100",
    footerText: "text-slate-600",
  },
  dark: {
    // Dark Mode with Blue Accents
    pageBg: "bg-slate-950",
    heroBg: "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950",
    heroOverlay: "bg-black/50",
    heroImageOverlay: "bg-gradient-to-t from-black/90 via-slate-900/40 to-transparent",
    
    headerBg: "bg-slate-900/95 backdrop-blur-md",
    headerText: "text-white",
    headerSubtitle: "text-slate-300",
    headerButton: "bg-blue-600 hover:bg-blue-700 text-white",
    headerBorder: "border-b border-slate-800",
    
    heroTitle: "text-white",
    heroSubtitle: "text-slate-300",
    heroTitleSize: "text-4xl md:text-5xl lg:text-6xl",
    heroSubtitleSize: "text-base md:text-lg",
    
    searchCard: "bg-slate-900/95 backdrop-blur-xl",
    searchCardShadow: "shadow-2xl shadow-black/60",
    searchCardBorder: "border border-slate-700",
    searchInputBg: "bg-slate-800",
    searchInputBorder: "border-slate-600",
    searchInputText: "text-white",
    searchInputFocus: "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30",
    
    primaryButton: "bg-blue-600 text-white",
    primaryButtonHover: "hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/30",
    secondaryButton: "bg-slate-800 text-blue-400 border border-blue-500",
    secondaryButtonHover: "hover:bg-slate-700",
    
    textPrimary: "text-white",
    textSecondary: "text-slate-200",
    textMuted: "text-slate-400",
    textInverse: "text-slate-900",
    
    cardBg: "bg-slate-900/90 backdrop-blur",
    cardBorder: "border border-slate-700",
    cardShadow: "shadow-xl shadow-black/40",
    cardHover: "hover:border-blue-500/50",
    cardHoverShadow: "hover:shadow-2xl hover:shadow-blue-500/20",
    
    roomCardBg: "bg-slate-900/90 backdrop-blur",
    roomCardBorder: "border border-slate-700",
    roomCardShadow: "shadow-xl",
    roomImageOverlay: "bg-gradient-to-t from-black/80 via-slate-900/30 to-transparent",
    
    priceColor: "text-blue-400",
    priceLabel: "text-slate-400",
    priceHighlight: "text-blue-300 font-bold",
    
    badgePrimary: "bg-blue-500/20 text-blue-300 border-blue-500/50",
    badgeSecondary: "bg-slate-800/50 text-slate-300 border-slate-700",
    badgeSuccess: "bg-green-500/20 text-green-300 border-green-500/50",
    badgeWarning: "bg-amber-500/20 text-amber-300 border-amber-500/50",
    
    summaryBg: "bg-slate-900/95 backdrop-blur-xl",
    summaryBorder: "border border-slate-700",
    summaryShadow: "shadow-2xl shadow-black/60",
    
    accentColor: "text-blue-400",
    accentBg: "bg-blue-500/10",
    accentBorder: "border-blue-500/30",
    
    planCardBg: "bg-slate-900/80",
    planCardBorder: "border border-slate-700",
    planCardSelected: "border-2 border-blue-500 bg-blue-500/10",
    planCardHover: "hover:border-blue-500/50 hover:shadow-lg",
    
    footerBg: "bg-slate-900/95 backdrop-blur-md",
    footerBorder: "border-t border-slate-800",
    footerText: "text-slate-300",
  },
  travel: {
    // Travel Landing Page - Estilo Booking.com
    pageBg: "bg-slate-50",
    heroBg: "bg-gradient-to-br from-[#003580] via-[#0047a3] to-[#0059b3]",
    heroOverlay: "bg-black/30",
    heroImageOverlay: "bg-gradient-to-t from-black/65 via-black/25 to-transparent",

    headerBg: "bg-[#003580]",
    headerText: "text-white",
    headerSubtitle: "text-blue-100",
    headerButton: "bg-[#febb02] hover:bg-[#ffd75a] text-slate-900 font-semibold",
    headerBorder: "border-b border-[#00224d]",

    heroTitle: "text-white font-semibold",
    heroSubtitle: "text-blue-100",
    heroTitleSize: "text-4xl md:text-5xl lg:text-6xl",
    heroSubtitleSize: "text-base md:text-lg",

    searchCard: "bg-white",
    searchCardShadow: "shadow-2xl shadow-black/10",
    searchCardBorder: "border border-slate-200",
    searchInputBg: "bg-white",
    searchInputBorder: "border-slate-300",
    searchInputText: "text-slate-900",
    searchInputFocus: "focus:border-[#003580] focus:ring-2 focus:ring-[#003580]/20",

    primaryButton: "bg-[#0071c2] text-white",
    primaryButtonHover: "hover:bg-[#005fa3] hover:shadow-lg hover:shadow-[#0071c2]/30",
    secondaryButton: "bg-white text-[#0071c2] border border-[#0071c2]",
    secondaryButtonHover: "hover:bg-blue-50",

    textPrimary: "text-slate-900",
    textSecondary: "text-slate-700",
    textMuted: "text-slate-500",
    textInverse: "text-white",

    cardBg: "bg-white",
    cardBorder: "border border-slate-200",
    cardShadow: "shadow-md shadow-black/5",
    cardHover: "hover:border-[#0071c2]/60",
    cardHoverShadow: "hover:shadow-lg hover:shadow-[#0071c2]/15",

    roomCardBg: "bg-white",
    roomCardBorder: "border border-slate-200",
    roomCardShadow: "shadow-md shadow-black/5",
    roomImageOverlay: "bg-gradient-to-t from-black/55 via-black/15 to-transparent",

    priceColor: "text-[#0071c2]",
    priceLabel: "text-slate-500",
    priceHighlight: "text-[#003580] font-bold",

    badgePrimary: "bg-[#e7f3ff] text-[#003580] border-[#b6d6ff]",
    badgeSecondary: "bg-slate-100 text-slate-700 border-slate-200",
    badgeSuccess: "bg-emerald-50 text-emerald-700 border-emerald-200",
    badgeWarning: "bg-[#fff4d1] text-[#8a6b00] border-[#ffe59a]",

    summaryBg: "bg-white",
    summaryBorder: "border border-slate-200",
    summaryShadow: "shadow-xl shadow-black/10",

    accentColor: "text-[#0071c2]",
    accentBg: "bg-[#e7f3ff]",
    accentBorder: "border-[#b6d6ff]",

    planCardBg: "bg-white",
    planCardBorder: "border border-slate-200",
    planCardSelected: "border-2 border-[#0071c2] bg-[#e7f3ff]",
    planCardHover: "hover:border-[#0071c2]/70 hover:shadow-md",

    footerBg: "bg-[#003580]",
    footerBorder: "border-t border-[#00224d]",
    footerText: "text-blue-100",
  },
};

const BookingEnginePage = () => {
  const { companySlug } = useParams<{ companySlug?: string }>();
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { settings: siteSettings, isLoading: isLoadingSiteSettings } = useSiteSettings();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [establishment, setEstablishment] = useState<any>(null);
  const [companyEstablishments, setCompanyEstablishments] = useState<any[]>([]);
  const [establishmentsWithCities, setEstablishmentsWithCities] = useState<any[]>([]);
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [hotelSettings, setHotelSettings] = useState<any>(null);
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [showEstablishmentDialog, setShowEstablishmentDialog] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const [showSearchEstablishmentDialog, setShowSearchEstablishmentDialog] = useState(false);
  const [searchDialogCity, setSearchDialogCity] = useState<string>("all");
  const [showPriceInfoDialog, setShowPriceInfoDialog] = useState(false);

  const [checkin, setCheckin] = useState(searchParams.get("checkin") || "");
  const [checkout, setCheckout] = useState(searchParams.get("checkout") || "");
  const [adults, setAdults] = useState(searchParams.get("adults") || "2");
  const [children, setChildren] = useState(searchParams.get("children") || "0");
  const [coupon, setCoupon] = useState(searchParams.get("coupon") || "");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [roomCategories, setRoomCategories] = useState<any[]>([]);
  const [categoriesByEstablishment, setCategoriesByEstablishment] = useState<Record<string, { establishment: any; categories: any[] }>>({});
  const [allHotelSettings, setAllHotelSettings] = useState<Record<string, any>>({});
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [categoryPrices, setCategoryPrices] = useState<Record<string, number | null>>({});
  const [categoryPricesPlan1, setCategoryPricesPlan1] = useState<Record<string, number | null>>({});
  const [calculatingPrices, setCalculatingPrices] = useState(false);
  const [publicPricingPlan1Id, setPublicPricingPlan1Id] = useState<string | null>(null);
  const [publicPricingPlan1Title, setPublicPricingPlan1Title] = useState<string | null>(null);
  const [publicPricingPlan2Id, setPublicPricingPlan2Id] = useState<string | null>(null);
  const [publicPricingPlan2Title, setPublicPricingPlan2Title] = useState<string | null>(null);

  // Hero image from booking engine config only (não usar establishment_photos)
  const heroImage = useMemo(() => {
    // Priorizar: booking_engine_hero_image configurado > imagem padrão
    // NÃO usar establishment_photos da página pública
    if (company?.booking_engine_hero_image) {
      return company.booking_engine_hero_image;
    }
    if (hotelSettings?.booking_engine_hero_image) {
      return hotelSettings.booking_engine_hero_image;
    }
    // Se não houver imagem configurada, usar imagem padrão genérica
    return "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1920&q=80";
  }, [company, hotelSettings]);

  // Título do motor (header)
  const motorTitle = useMemo(() => {
    return company?.booking_engine_title || 
           hotelSettings?.booking_engine_title || 
           establishment?.name || 
           company?.name || 
           "Motor de Reservas";
  }, [company, hotelSettings, establishment]);

  const motorSubtitle = useMemo(() => {
    // Subtítulo específico do motor configurado pelo usuário
    // Se não houver subtítulo configurado, usar nome da empresa ou texto genérico
    // NÃO usar nome do estabelecimento, pois o motor é por empresa
    if (company?.booking_engine_subtitle) {
      return company.booking_engine_subtitle;
    }
    
    // Fallback: usar nome da empresa ou texto genérico
    if (company?.name) {
      return `Reservas em ${company.name}`;
    }
    
    // Se não houver nada configurado, retornar vazio (não mostrar subtítulo)
    return "";
  }, [company?.booking_engine_subtitle, company?.name]);

  // Atualizar título da página (aba do navegador) com o título e subtítulo do motor de reservas
  useEffect(() => {
    if (motorTitle && motorTitle !== "Motor de Reservas") {
      // Se houver subtítulo, incluir no título da página
      if (motorSubtitle) {
        document.title = `${motorTitle} - ${motorSubtitle}`;
      } else {
        document.title = motorTitle;
      }
    } else if (company?.name) {
      // Se houver subtítulo, incluir no título da página
      if (motorSubtitle) {
        document.title = `${company.name} - ${motorSubtitle}`;
      } else {
        document.title = `${company.name} - Motor de Reservas`;
      }
    } else {
      document.title = "Motor de Reservas";
    }
  }, [motorTitle, motorSubtitle, company?.name]);

  // Hero title and subtitle from config
  const heroTitle = useMemo(() => {
    return company?.booking_engine_hero_title || 
           hotelSettings?.booking_engine_hero_title || 
           "Reserve sua estadia";
  }, [company, hotelSettings]);

  const heroSubtitle = useMemo(() => {
    return company?.booking_engine_hero_subtitle || 
           hotelSettings?.booking_engine_hero_subtitle || 
           "Encontre o quarto ideal para sua próxima estadia. Compare categorias, planos tarifários e disponibilidade em tempo real.";
  }, [company, hotelSettings]);

  // Logo e favicon do motor
  const motorLogo = useMemo(() => {
    return company?.booking_engine_logo || null;
  }, [company]);

  const motorFavicon = useMemo(() => {
    return company?.booking_engine_favicon || null;
  }, [company]);

  // Redes sociais
  const socialInstagram = company?.booking_engine_social_instagram || null;
  const socialFacebook = company?.booking_engine_social_facebook || null;
  const socialTwitter = company?.booking_engine_social_twitter || null;
  const socialYoutube = company?.booking_engine_social_youtube || null;
  const socialWebsite = company?.booking_engine_social_website || null;
  const socialWhatsapp = company?.booking_engine_social_whatsapp || null;

  // Chat Chatwoot
  const chatEnabled = company?.booking_engine_chat_enabled || false;
  const chatBaseUrl = company?.booking_engine_chat_base_url || null;
  const chatWebsiteToken = company?.booking_engine_chat_website_token || null;

  // Atualizar favicon dinamicamente (identidade exclusiva do motor)
  useEffect(() => {
    // Remover todos os favicons existentes (do sistema)
    const existingIcons = document.querySelectorAll(
      "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
    );
    existingIcons.forEach((el) => el.parentNode?.removeChild(el));

    // Se o motor tiver favicon configurado, aplicar apenas o favicon do motor
    if (motorFavicon) {
      const newLink = document.createElement("link");
      newLink.rel = "icon";
      newLink.href = motorFavicon;
      document.head.appendChild(newLink);
    }
    // Se não tiver favicon do motor, não recriamos o favicon do sistema:
    // a página do motor fica sem favicon ou com o que o navegador já tiver em cache,
    // evitando mostrar branding do sistema nesta página.
  }, [motorFavicon]);

  // Carregar Chatwoot quando habilitado
  useEffect(() => {
    if (!chatEnabled || !chatBaseUrl || !chatWebsiteToken) {
      // Se o chat não estiver habilitado ou faltar configuração, remover script existente
      const existingScript = document.querySelector('script[data-chatwoot]');
      if (existingScript) {
        existingScript.remove();
      }
      return;
    }

    // Verificar se o script já foi carregado
    const existingScript = document.querySelector('script[data-chatwoot]');
    if (existingScript) {
      // Se já existe, apenas atualizar a configuração
      if (window.chatwootSDK) {
        window.chatwootSDK.run({
          websiteToken: chatWebsiteToken,
          baseUrl: chatBaseUrl
        });
      }
      return;
    }

    // Carregar script do Chatwoot
    const script = document.createElement('script');
    script.setAttribute('data-chatwoot', 'true');
    script.src = `${chatBaseUrl}/packs/js/sdk.js`;
    script.async = true;
    
    script.onload = () => {
      if (window.chatwootSDK) {
        window.chatwootSDK.run({
          websiteToken: chatWebsiteToken,
          baseUrl: chatBaseUrl
        });
      }
    };

    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }

    // Cleanup: remover script ao desmontar ou quando desabilitar
    return () => {
      const scriptToRemove = document.querySelector('script[data-chatwoot]');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [chatEnabled, chatBaseUrl, chatWebsiteToken]);

  useEffect(() => {
    // Resetar erro ao iniciar carregamento
    setError(null);
    
    if (isLoadingSiteSettings) {
      return;
    }

    const load = async () => {
      // Se não houver siteSettings, ainda tentar carregar (pode funcionar sem feature flags)
      const effectiveSiteSettings = siteSettings || {
        features_enabled: {},
      } as any;
      // Detectar host atual (domínio que o usuário está acessando)
      // Isso pode ser o domínio personalizado ou o domínio padrão do PMS
      const currentHost = typeof window !== "undefined" ? window.location.host : undefined;

      // Verificar se estamos em um domínio personalizado
      // Se estivermos e houver companySlug na URL, bloquear acesso a outros motores
      if (currentHost && companySlug) {
        const normalizeDomain = (domain: string) => {
          if (!domain) return "";
          return domain
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .split("/")[0];
        };
        
        const normalizedHost = normalizeDomain(currentHost);
        
        // Verificar se o domínio atual é um domínio personalizado configurado
        const { data: companies } = await supabase
          .from("companies")
          .select("id, booking_engine_custom_domain")
          .not("booking_engine_custom_domain", "is", null);

        const isCustomDomain = companies?.some((company) => {
          if (!company.booking_engine_custom_domain) return false;
          const normalizedConfig = normalizeDomain(company.booking_engine_custom_domain);
          return normalizedConfig === normalizedHost;
        });

        // Se for domínio personalizado e houver companySlug, redirecionar para a raiz
        // Isso impede acesso a outros motores através do domínio personalizado
        if (isCustomDomain) {
          console.log("[BookingEngine] Domínio personalizado detectado com companySlug, redirecionando para raiz");
          navigate("/", { replace: true });
          return;
        }
      }

      let initialEstablishment: any = null;
      let foundCompany: any = null;

      // Buscar empresa por slug do motor de reservas
      if (companySlug) {
        console.log("[BookingEngine] Buscando empresa por slug:", companySlug);
        
        const { data: companyBySlug, error: companyError } = await supabase
          .from("companies")
          .select("*")
          .eq("booking_engine_slug", companySlug)
          .maybeSingle();

        if (companyError) {
          console.error("[BookingEngine] Erro ao buscar empresa por slug:", companyError);
          setError("Erro ao buscar empresa. Verifique se o motor de reservas está configurado corretamente.");
          setLoading(false);
          return;
        }

        if (companyBySlug) {
          console.log("[BookingEngine] Empresa encontrada:", companyBySlug.id, companyBySlug.name);
          foundCompany = companyBySlug;
        } else {
          // Tentar buscar todas as empresas para debug
          const { data: allCompanies } = await supabase
            .from("companies")
            .select("id, name, booking_engine_slug, booking_engine_title")
            .not("booking_engine_slug", "is", null)
            .limit(10);
          
          console.log("[BookingEngine] Empresas com slug configurado:", allCompanies);
          console.log("[BookingEngine] Slug buscado:", companySlug);
          console.log("[BookingEngine] Comparação exata:", allCompanies?.map(c => ({
            slug: c.booking_engine_slug,
            matches: c.booking_engine_slug === companySlug
          })));
          
          // Se não encontrou por slug, mostrar erro
          // Não fazer fallback para estabelecimentos pois o slug é específico para empresas
          setError(`Empresa não encontrada com o slug "${companySlug}". Verifique se o slug do motor de reservas está configurado corretamente nas configurações.`);
          setLoading(false);
          return;
        }
      } else if (currentHost) {
        // Normalizar o domínio (remover protocolo, www., converter para minúsculas)
        const normalizeDomain = (domain: string) => {
          if (!domain) return "";
          return domain
            .toLowerCase()
            .replace(/^https?:\/\//, "") // Remover http:// ou https://
            .replace(/^www\./, "") // Remover www.
            .split("/")[0]; // Pegar apenas o host (remover path se houver)
        };
        
        const normalizedHost = normalizeDomain(currentHost);
        
        // Verificar se o domínio atual corresponde a um domínio personalizado configurado
        // Buscar todos os domínios configurados e comparar com normalização
        const { data: companies } = await supabase
          .from("companies")
          .select("*")
          .not("booking_engine_custom_domain", "is", null);

        const companyByDomain = companies?.find((company) => {
          if (!company.booking_engine_custom_domain) return false;
          const normalizedConfig = normalizeDomain(company.booking_engine_custom_domain);
          return normalizedConfig === normalizedHost;
        });

        if (companyByDomain) {
          foundCompany = companyByDomain;
        } else {
          // Verificar também em hotel_settings (legado)
          const { data: hotelSettings } = await supabase
            .from("hotel_settings")
            .select("establishment_id, booking_engine_custom_domain")
            .not("booking_engine_custom_domain", "is", null);

          const byDomain = hotelSettings?.find((setting) => {
            if (!setting.booking_engine_custom_domain) return false;
            const normalizedConfig = normalizeDomain(setting.booking_engine_custom_domain);
            return normalizedConfig === normalizedHost;
          });
          
          if (byDomain && (byDomain as any).establishment_id) {
            const { data: est } = await supabase
              .from("establishments")
              .select("*")
              .eq("id", (byDomain as any).establishment_id)
              .maybeSingle();
            if (est) initialEstablishment = est;
          } else {
            // Apenas tentar fallback por subdomínio em domínios do Vercel / desenvolvimento.
            // Para domínios personalizados (clientes), evitamos essa chamada para não gerar erros 400
            // e confiamos apenas na configuração explícita de domínio nas tabelas.
            const isVercelLikeDomain =
              currentHost.includes("vercel.app") ||
              currentHost.includes("localhost") ||
              currentHost.includes("127.0.0.1");

            if (isVercelLikeDomain) {
              // Tentar detectar pelo subdomínio (ex: reservas.exemplo.com -> exemplo)
              const parts = currentHost.split(".");
              if (parts.length > 2) {
                const potentialSlug = parts[0];
                const { data: est } = await supabase
                  .from("establishments")
                  .select("*")
                  .eq("slug", potentialSlug)
                  .maybeSingle();
                if (est) initialEstablishment = est;
              }
            } else {
              console.warn(
                "[BookingEngine] Domínio personalizado não mapeado nas configurações do motor:",
                currentHost
              );
            }
          }
        }
      }

      // Se encontrou estabelecimento, buscar empresa e verificar se está no motor
      if (initialEstablishment) {
        // Buscar empresa do estabelecimento
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("*")
          .eq("id", initialEstablishment.company_id)
          .maybeSingle();
        
        if (companyError) {
          console.error("[BookingEngine] Erro ao buscar empresa:", companyError);
          setError("Erro ao buscar empresa. Verifique se o motor de reservas está configurado corretamente.");
          setLoading(false);
          return;
        }
        
        if (companyData) {
          foundCompany = companyData;
          
          // Verificar se o estabelecimento está ativo no motor de reservas
          const { data: engineCheck, error: engineCheckError } = await supabase
            .from("company_booking_engine_establishments")
            .select("id, is_active")
            .eq("company_id", foundCompany.id)
            .eq("establishment_id", initialEstablishment.id)
            .eq("is_active", true)
            .maybeSingle();

          if (engineCheckError && engineCheckError.code !== "PGRST116") {
            console.error("[BookingEngine] Erro ao verificar motor:", engineCheckError);
          }

          // Se não estiver no motor, mostrar erro
          if (!engineCheck || !engineCheck.is_active) {
            setError("Este estabelecimento não está disponível no motor de reservas.");
            setLoading(false);
            return;
          }
        } else {
          setError("Empresa não encontrada para este estabelecimento.");
          setLoading(false);
          return;
        }
      }

      // Se encontrou empresa diretamente (por domínio), verificar se tem estabelecimentos no motor
      if (foundCompany && !initialEstablishment) {
        // Verificar se a empresa tem estabelecimentos no motor
        const { data: engineCheck } = await supabase
          .from("company_booking_engine_establishments")
          .select("id")
          .eq("company_id", foundCompany.id)
          .eq("is_active", true)
          .limit(1);

        if (!engineCheck || engineCheck.length === 0) {
          setError("Nenhum estabelecimento disponível no motor de reservas para esta empresa.");
          setLoading(false);
          return;
        }
      }

      if (!foundCompany) {
        setError("Empresa não encontrada. Verifique se o motor de reservas está configurado corretamente.");
        setLoading(false);
        return;
      }

      setCompany(foundCompany);

      const enabled = isFeatureEnabledForEstablishment(
        (effectiveSiteSettings?.features_enabled as any)?.booking_engine_enabled,
        foundCompany.id,
        true
      );

      if (!enabled && !foundCompany.booking_engine_enabled) {
        if (initialEstablishment) {
          const estAny = initialEstablishment as any;
          const slug = estAny.slug || estAny.numeric_id?.toString() || estAny.id;
          const params = new URLSearchParams(searchParams);
          navigate(`/reservar/${slug}?${params.toString()}`, { replace: true });
        } else {
          setError("Motor de reservas não está habilitado para esta empresa.");
          setLoading(false);
        }
        return;
      }

      setEngineEnabled(true);

      // Buscar estabelecimentos ativos no motor de reservas
      const { data: engineEstablishments, error: engineError } = await supabase
        .from("company_booking_engine_establishments")
        .select("*, establishments(*)")
        .eq("company_id", foundCompany.id)
        .eq("is_active", true)
        .order("display_order")
        .order("created_at");

      if (engineError) {
        console.error("[BookingEngine] Erro ao buscar estabelecimentos do motor:", engineError);
        setError("Erro ao carregar estabelecimentos do motor de reservas.");
        setLoading(false);
        return;
      }

      if (engineEstablishments && engineEstablishments.length > 0) {
        const establishmentsList = engineEstablishments
          .map((e: any) => e.establishments)
          .filter(Boolean);
        
        // Buscar cidades e fotos dos estabelecimentos
        const establishmentsWithCityData = await Promise.all(
          establishmentsList.map(async (est: any) => {
            const { data: hotelSettingsData } = await supabase
              .from("hotel_settings")
              .select("city, establishment_photos, photo_url")
              .eq("establishment_id", est.id)
              .maybeSingle();
            
            // Obter primeira foto do array ou photo_url
            const photos = hotelSettingsData?.establishment_photos || [];
            const photo = photos.length > 0 
              ? photos[0] 
              : hotelSettingsData?.photo_url || null;
            
            return {
              ...est,
              city: hotelSettingsData?.city || null,
              photo: photo,
            };
          })
        );
        
        setEstablishmentsWithCities(establishmentsWithCityData);
        setCompanyEstablishments(establishmentsList);

        // Apenas selecionar se houver um estabelecimento inicial (vindo de URL ou parâmetro)
        if (initialEstablishment && 
          establishmentsList.find((e: any) => e.id === initialEstablishment.id)) {
          setSelectedEstablishmentId(initialEstablishment.id);
          setEstablishment(initialEstablishment);
        } else {
          // Não selecionar nenhum estabelecimento por padrão
          setSelectedEstablishmentId(null);
          setEstablishment(null);
        }
      } else {
        // Se não houver estabelecimentos configurados no motor, usar todos os estabelecimentos ativos da empresa
        // (fallback para compatibilidade)
        const { data: allEsts, error: allEstsError } = await supabase
          .from("establishments")
          .select("*")
          .eq("company_id", foundCompany.id)
          .eq("is_active", true)
          .order("name");
        
        if (allEstsError) {
          console.error("[BookingEngine] Erro ao buscar estabelecimentos:", allEstsError);
          setError("Erro ao carregar estabelecimentos.");
          setLoading(false);
          return;
        }
        
        if (allEsts && allEsts.length > 0) {
          // Buscar cidades e fotos dos estabelecimentos
          const establishmentsWithCityData = await Promise.all(
            allEsts.map(async (est: any) => {
              const { data: hotelSettingsData } = await supabase
                .from("hotel_settings")
                .select("city, establishment_photos, photo_url")
                .eq("establishment_id", est.id)
                .maybeSingle();
              
              // Obter primeira foto do array ou photo_url
              const photos = hotelSettingsData?.establishment_photos || [];
              const photo = photos.length > 0 
                ? photos[0] 
                : hotelSettingsData?.photo_url || null;
              
              return {
                ...est,
                city: hotelSettingsData?.city || null,
                photo: photo,
              };
            })
          );
          
          setEstablishmentsWithCities(establishmentsWithCityData);
          setCompanyEstablishments(allEsts);
          
          // Apenas selecionar se houver um estabelecimento inicial (vindo de URL ou parâmetro)
          if (initialEstablishment && 
            allEsts.find((e: any) => e.id === initialEstablishment.id)) {
            setSelectedEstablishmentId(initialEstablishment.id);
            setEstablishment(initialEstablishment);
          } else {
            // Não selecionar nenhum estabelecimento por padrão
            setSelectedEstablishmentId(null);
            setEstablishment(null);
          }
        } else {
          setError("Nenhum estabelecimento encontrado para esta empresa.");
          setLoading(false);
          return;
        }
      }

      setLoading(false);
    };

    load();
  }, [companySlug, isLoadingSiteSettings, siteSettings, navigate, searchParams]);

  // Filtrar estabelecimentos por cidade selecionada
  const filteredEstablishments = useMemo(() => {
    if (selectedCity === "all") {
      return companyEstablishments;
    }
    const filteredIds = establishmentsWithCities
      .filter((est: any) => est.city === selectedCity)
      .map((est: any) => est.id);
    return companyEstablishments.filter((est: any) => filteredIds.includes(est.id));
  }, [companyEstablishments, establishmentsWithCities, selectedCity]);

  // Carregar categorias de todos os estabelecimentos ativos (ou apenas do selecionado)
  useEffect(() => {
    if (!engineEnabled || companyEstablishments.length === 0) {
      setRoomCategories([]);
      setCategoriesByEstablishment({});
      return;
    }

    const loadAllCategories = async () => {
      setRoomsLoading(true);
      
      // Se houver estabelecimento selecionado, mostrar apenas suas categorias
      // Caso contrário, mostrar todas as categorias de todos os estabelecimentos filtrados
      let establishmentIds: string[];
      if (selectedEstablishmentId) {
        // Filtrar apenas o estabelecimento selecionado
        establishmentIds = [selectedEstablishmentId];
      } else {
        // Mostrar todos os estabelecimentos filtrados
        establishmentIds = filteredEstablishments.map((est: any) => est.id);
      }
      
      if (establishmentIds.length === 0) {
        setRoomCategories([]);
        setCategoriesByEstablishment({});
        setRoomsLoading(false);
        return;
      }

      // Buscar todas as categorias dos estabelecimentos filtrados
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("room_categories" as any)
        .select("*")
        .in("establishment_id", establishmentIds)
        .eq("show_in_public", true)
        .order("display_order")
        .order("name");

      if (categoriesError) {
        console.error("[BookingEngine] Erro ao buscar categorias:", categoriesError);
        setRoomCategories([]);
        setCategoriesByEstablishment({});
        setRoomsLoading(false);
        return;
      }

      if (!categoriesData || categoriesData.length === 0) {
        setRoomCategories([]);
        setCategoriesByEstablishment({});
        setRoomsLoading(false);
        return;
      }

      // Agrupar categorias por estabelecimento
      const grouped: Record<string, { establishment: any; categories: any[] }> = {};
      
      for (const category of categoriesData) {
        const estId = category.establishment_id;
        const establishment = filteredEstablishments.find((est: any) => est.id === estId);
        
        if (establishment) {
          if (!grouped[estId]) {
            grouped[estId] = {
              establishment: establishment,
              categories: []
            };
          }
          grouped[estId].categories.push(category);
        }
      }

      setCategoriesByEstablishment(grouped);
      setRoomCategories(categoriesData);
      
      // Buscar hotel_settings de todos os estabelecimentos
      const settingsMap: Record<string, any> = {};
      for (const estId of establishmentIds) {
        const { data: settingsData } = await supabase
          .from("hotel_settings" as any)
          .select("*")
          .eq("establishment_id", estId)
          .maybeSingle();
        if (settingsData) {
          settingsMap[estId] = settingsData;
        }
      }
      setAllHotelSettings(settingsMap);
      
      // Se houver um estabelecimento selecionado, carregar suas configurações
      if (selectedEstablishmentId && settingsMap[selectedEstablishmentId]) {
        const settingsData = settingsMap[selectedEstablishmentId];
        setHotelSettings(settingsData);

        const plan1Id = (settingsData as any).public_pricing_plan_1_id || null;
        const plan2Id = (settingsData as any).public_pricing_plan_2_id || null;
        setPublicPricingPlan1Id(plan1Id);
        setPublicPricingPlan1Title((settingsData as any).public_pricing_plan_1_title || null);
        setPublicPricingPlan2Id(plan2Id);
        setPublicPricingPlan2Title((settingsData as any).public_pricing_plan_2_title || null);
      }
      
      setRoomsLoading(false);
    };

    loadAllCategories();
  }, [engineEnabled, companyEstablishments, filteredEstablishments, selectedEstablishmentId, selectedCity]);

  const themeKey: BookingThemeKey = useMemo(() => {
    // Priorizar tema da empresa, depois do estabelecimento
    const key =
      (company?.booking_engine_theme as BookingThemeKey) ||
      (hotelSettings?.booking_engine_theme as BookingThemeKey) ||
      "default";
    const validKey = (
      ["default", "modern", "luxury", "minimal", "dark", "travel"] as BookingThemeKey[]
    ).includes(key)
      ? key
      : "default";
    return validKey;
  }, [company, hotelSettings]);

  // Garantir que o tema seja aplicado corretamente
  const theme = useMemo(() => {
    return THEME_CONFIGS[themeKey];
  }, [themeKey]);

  const isDarkTheme = themeKey === "modern" || themeKey === "luxury" || themeKey === "dark";

  const formatDateDisplay = (value: string | null): string => {
    if (!value) return "";
    const [year, month, day] = value.split("-");
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  };

  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const rooms = useMemo(() => {
    if (!roomCategories || roomCategories.length === 0) return [];

    return roomCategories.map((cat) => {
      const image =
        (cat.display_photos && cat.display_photos[0]) ||
        "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80";

      const amenities: string[] = Array.isArray(cat.display_features)
        ? cat.display_features
        : [];

      const capacityAdults = cat.capacity_adults ?? cat.max_adults ?? null;
      const capacityChildren = cat.capacity_children ?? cat.max_children ?? null;
      const size =
        cat.size_m2 || cat.room_size || cat.area
          ? `${cat.size_m2 || cat.room_size || cat.area} m²`
          : null;

      const capacityLabel = [
        capacityAdults ? `${capacityAdults} adulto(s)` : null,
        capacityChildren && capacityChildren > 0 ? `${capacityChildren} criança(s)` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const basePrice = cat.base_price || cat.min_price || null;
      const dynamicPricePlan1 = categoryPricesPlan1[cat.id as string];

      // Buscar hotel_settings do estabelecimento desta categoria
      const establishmentId = cat.establishment_id;
      const settings = allHotelSettings[establishmentId];
      const plan1Id = settings?.public_pricing_plan_1_id || null;
      const plan1Title = settings?.public_pricing_plan_1_title || null;

      const plans: any[] = [];

      const hasDynamicPrice = dynamicPricePlan1 !== null && dynamicPricePlan1 !== undefined;

      if (plan1Id) {
        plans.push({
          id: `${cat.id}-plan1`,
          name: plan1Title || "Plano Tarifário 1",
          description: hasDynamicPrice
            ? "Tarifa calculada em tempo real para as datas e hóspedes selecionados."
            : "Selecione datas e hóspedes para ver o valor desta categoria.",
          benefits: hasDynamicPrice
            ? ["Melhor tarifa disponível para o seu período", "Atualização em tempo real"]
            : ["Cálculo em tempo real na próxima etapa", "Tarifa sujeita a variação"],
          tag: hasDynamicPrice ? "A partir de" : undefined,
          pricePerNight:
            hasDynamicPrice
              ? dynamicPricePlan1
              : 0,
          planId: plan1Id,
        });
      } else {
        plans.push({
          id: `${cat.id}-default`,
          name: "Tarifa Padrão",
          description: "Selecione datas e hóspedes para ver valores personalizados desta categoria.",
          benefits: ["Cálculo em tempo real na página de reserva"],
          tag: undefined,
          pricePerNight: 0,
          planId: null,
        });
      }

      return {
        id: cat.id as string,
        categoryId: cat.id as string,
        name: cat.name as string,
        size: size || "",
        capacity: capacityLabel || "",
        image,
        amenities,
        highlight: cat.highlight_badge || "",
        plans,
      };
    });
  }, [roomCategories, categoryPricesPlan1, allHotelSettings]);

  const nights = useMemo(() => {
    if (!checkin || !checkout) return 0;
    const ci = new Date(checkin);
    const co = new Date(checkout);
    const diff = co.getTime() - ci.getTime();
    return diff > 0 ? Math.ceil(diff / (1000 * 60 * 60 * 24)) : 0;
  }, [checkin, checkout]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const selectedPlan = useMemo(
    () => selectedRoom?.plans.find((p) => p.id === selectedPlanId) || null,
    [selectedRoom, selectedPlanId]
  );

  // Obter cidades únicas dos estabelecimentos
  const availableCities = useMemo(() => {
    const cities = establishmentsWithCities
      .map((est: any) => est.city)
      .filter((city: string | null) => city && city.trim() !== "")
      .filter((city: string, index: number, self: string[]) => self.indexOf(city) === index)
      .sort();
    return cities;
  }, [establishmentsWithCities]);

  // Desmarcar estabelecimento selecionado se não estiver na cidade filtrada
  useEffect(() => {
    if (selectedCity !== "all" && selectedEstablishmentId) {
      const selectedEst = establishmentsWithCities.find((est: any) => est.id === selectedEstablishmentId);
      if (selectedEst && selectedEst.city !== selectedCity) {
        setSelectedEstablishmentId(null);
        setEstablishment(null);
        setSelectedRoomId(null);
        setSelectedPlanId(null);
      }
    }
  }, [selectedCity, selectedEstablishmentId, establishmentsWithCities]);

  const totalAmount = useMemo(() => {
    if (!selectedPlan || nights <= 0) return null;
    return selectedPlan.pricePerNight * nights;
  }, [selectedPlan, nights]);

  useEffect(() => {
    const run = async () => {
      if (!roomCategories.length) {
        return;
      }

      setCalculatingPrices(true);
      try {
        const adultsNum = parseInt(adults, 10) || 1;
        const childrenNum = parseInt(children, 10) || 0;
        const pricesPlan1: Record<string, number | null> = {};

        let startDate: Date;
        let nightsCount: number;

        if (checkin && checkout && checkin < checkout) {
          const [checkinYear, checkinMonth, checkinDay] = checkin.split("-").map(Number);
          const [checkoutYear, checkoutMonth, checkoutDay] = checkout.split("-").map(Number);
          const checkinDate = new Date(checkinYear, checkinMonth - 1, checkinDay);
          const checkoutDate = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
          const diffMs = checkoutDate.getTime() - checkinDate.getTime();
          nightsCount = diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
          startDate = checkinDate;
        } else {
          startDate = new Date();
          nightsCount = 1;
        }

        if (nightsCount <= 0) return;

        // Buscar hotel_settings para cada estabelecimento único
        const establishmentIds = [...new Set(roomCategories.map((cat: any) => cat.establishment_id))];
        const hotelSettingsMap: Record<string, any> = {};
        
        for (const estId of establishmentIds) {
          const { data: settingsData } = await supabase
            .from("hotel_settings" as any)
            .select("*")
            .eq("establishment_id", estId)
            .maybeSingle();
          if (settingsData) {
            hotelSettingsMap[estId] = settingsData;
          }
        }

        for (const cat of roomCategories) {
          const establishmentId = cat.establishment_id;
          const settings = hotelSettingsMap[establishmentId];
          const plan1Id = settings?.public_pricing_plan_1_id || null;
          
          if (!plan1Id) {
            pricesPlan1[cat.id] = null;
            continue;
          }
          const basePrice = Number(cat.base_price || 0);
          let total1 = 0;
          for (let i = 0; i < nightsCount; i++) {
            const currentDate = addDays(startDate, i);
            const dateStr = formatDateLocal(currentDate);

            const { data, error } = await (supabase as any).rpc("calculate_rate_price", {
              p_establishment_id: establishmentId,
              p_category_id: cat.id,
              p_pricing_plan_id: plan1Id,
              p_date: dateStr,
              p_adults: adultsNum,
              p_children: childrenNum,
            });

            if (error) {
              total1 += basePrice;
            } else {
              const price = Number(data || 0);
              total1 += price > 0 ? price : basePrice;
            }
          }
          pricesPlan1[cat.id as string] =
            total1 > 0 && nightsCount > 0 ? total1 / nightsCount : null;
        }

        setCategoryPricesPlan1(pricesPlan1);
        setCategoryPrices(pricesPlan1);
      } finally {
        setCalculatingPrices(false);
      }
    };

    run();
  }, [roomCategories, checkin, checkout, adults, children]);

  const handleSubmit = (categoryId?: string) => {
    // Usar categoryId passado como parâmetro ou selectedRoomId
    const targetCategoryId = categoryId || selectedRoomId;
    if (!targetCategoryId) {
      // Se não há categoria selecionada, não fazer nada
      return;
    }

    // Obter categoria selecionada
    const selectedCategory = roomCategories.find((cat: any) => cat.id === targetCategoryId);
    if (!selectedCategory) return;
    
    const categoryEstablishmentId = selectedCategory.establishment_id;
    
    // Verificar se há um estabelecimento selecionado e se corresponde à categoria
    let targetEstablishmentId = selectedEstablishmentId;
    
    // Se não há estabelecimento selecionado OU o estabelecimento selecionado não corresponde à categoria
    if (!targetEstablishmentId || targetEstablishmentId !== categoryEstablishmentId) {
      // Verificar se há múltiplos estabelecimentos com essa categoria (mesmo nome)
      const categoriesWithSameName = roomCategories.filter(
        (cat: any) => cat.name === selectedCategory.name
      );
      const uniqueEstablishments = [...new Set(categoriesWithSameName.map((cat: any) => cat.establishment_id))];
      
      // Se há apenas um estabelecimento para essa categoria, usar diretamente
      if (uniqueEstablishments.length === 1) {
        targetEstablishmentId = uniqueEstablishments[0];
      } else if (uniqueEstablishments.length > 1) {
        // Se há múltiplos estabelecimentos, mostrar diálogo para escolher
        setPendingCategoryId(targetCategoryId);
        setShowEstablishmentDialog(true);
        return;
      } else {
        // Se não encontrou estabelecimentos, usar o da categoria
        targetEstablishmentId = categoryEstablishmentId;
      }
    }

    // Buscar dados do estabelecimento
    const establishmentData = filteredEstablishments.find((est: any) => est.id === targetEstablishmentId);
    if (!establishmentData) {
      // Se não encontrou nos filtrados, buscar em todos
      const allEstData = companyEstablishments.find((est: any) => est.id === targetEstablishmentId);
      if (!allEstData) return;
      
      const estAny = allEstData as any;
      const slug = estAny.slug || estAny.numeric_id?.toString() || estAny.id;

      const params = new URLSearchParams();
      if (checkin) params.set("checkin", checkin);
      if (checkout) params.set("checkout", checkout);
      if (adults) params.set("adults", adults);
      if (children) params.set("children", children);
      if (coupon) params.set("coupon", coupon);
      params.set("category", targetCategoryId);
      if (selectedPlanId && selectedPlan) {
        params.set("plan", selectedPlan.planId || "");
      }

      navigate(`/reservar/${slug}?${params.toString()}`);
      return;
    }

    const estAny = establishmentData as any;
    const slug = estAny.slug || estAny.numeric_id?.toString() || estAny.id;

    const params = new URLSearchParams();
    if (checkin) params.set("checkin", checkin);
    if (checkout) params.set("checkout", checkout);
    if (adults) params.set("adults", adults);
    if (children) params.set("children", children);
    if (coupon) params.set("coupon", coupon);
    params.set("category", targetCategoryId);
    if (selectedPlanId && selectedPlan) {
      params.set("plan", selectedPlan.planId || "");
    }

    navigate(`/reservar/${slug}?${params.toString()}`);
  };

  const handleSelectEstablishmentForCategory = (establishmentId: string) => {
    if (!pendingCategoryId) return;
    
    const establishmentData = filteredEstablishments.find((est: any) => est.id === establishmentId) ||
                             companyEstablishments.find((est: any) => est.id === establishmentId);
    if (!establishmentData) return;

    const estAny = establishmentData as any;
    const slug = estAny.slug || estAny.numeric_id?.toString() || estAny.id;

    const params = new URLSearchParams();
    if (checkin) params.set("checkin", checkin);
    if (checkout) params.set("checkout", checkout);
    if (adults) params.set("adults", adults);
    if (children) params.set("children", children);
    if (coupon) params.set("coupon", coupon);
    params.set("category", pendingCategoryId);
    if (selectedPlanId && selectedPlan) {
      params.set("plan", selectedPlan.planId || "");
    }

    setShowEstablishmentDialog(false);
    setPendingCategoryId(null);
    navigate(`/reservar/${slug}?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t("bookingEngine.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="max-w-md w-full p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("bookingEngine.error.title")}</h2>
            <p className="text-slate-600 mb-6">{error}</p>
            <Button onClick={() => window.location.reload()} variant="default">
              {t("bookingEngine.error.retry")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!engineEnabled || !company) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme.pageBg}`}>
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-current border-t-transparent mx-auto" style={{ color: theme.accentColor.replace('text-', '') }}></div>
          <p className={`${theme.textSecondary} text-sm`}>
            {t("bookingEngine.loading")}
          </p>
        </div>
      </div>
    );
  }

  const establishmentName = (establishment as any)?.name || (hotelSettings as any)?.name || "";
  
  // Contatos gerais do motor de reservas (prioridade) ou fallback para contatos do estabelecimento
  const contactCnpj = company?.booking_engine_contact_cnpj || (hotelSettings as any)?.establishment_cnpj || "";
  const contactPhone = company?.booking_engine_contact_phone || (hotelSettings as any)?.phone || "";
  const contactWhatsappDdi = company?.booking_engine_contact_whatsapp_ddi || (hotelSettings as any)?.whatsapp_ddi || "";
  const contactWhatsappNumber = company?.booking_engine_contact_whatsapp_number || (hotelSettings as any)?.whatsapp_number || "";
  const contactEmail = company?.booking_engine_contact_email || (hotelSettings as any)?.email || "";

  return (
    <>
      <style>{animationStyles}</style>
      <div className={`min-h-screen ${theme.pageBg}`}>
        {/* Header */}
        <header className={`${theme.headerBg} ${theme.headerText} sticky top-0 z-50 ${theme.headerBorder || ""} transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                {motorLogo && (
                  <div className="h-10 w-10 md:h-11 md:w-11 rounded-full bg-white/90 shadow-sm flex items-center justify-center overflow-hidden ring-1 ring-black/5">
                    <img
                      src={motorLogo}
                      alt="Logo"
                      className="h-8 w-8 md:h-9 md:w-9 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
                <div className="flex flex-col">
                  <span
                    className={`text-lg md:text-2xl font-semibold tracking-tight ${
                      themeKey === "travel" ? "text-white" : theme.textPrimary
                    }`}
                  >
                    {motorTitle}
                  </span>
                  {motorSubtitle && (
                    <span className={`text-xs md:text-sm ${theme.headerSubtitle} transition-colors duration-300`}>
                      {motorSubtitle}
                    </span>
                  )}
              </div>
            </div>
              <div className="flex items-center justify-start sm:justify-end gap-3">
                <LanguageSelector />
            <Button 
                  className={`${theme.headerButton} px-5 py-2 rounded-full text-sm md:text-base font-medium shadow-sm hover:shadow-md transition-all duration-200`}
              onClick={() => setShowSearchEstablishmentDialog(true)}
            >
              <Search className="w-4 h-4 mr-2" />
              Buscar Quarto
            </Button>
              </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Background Image */}
      <section className={`relative min-h-[500px] md:min-h-[600px] lg:min-h-[700px] flex items-center justify-center overflow-hidden`}>
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-700 hover:scale-105"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className={`absolute inset-0 ${theme.heroImageOverlay} transition-opacity duration-300`} />
          <div className={`absolute inset-0 ${theme.heroOverlay} transition-opacity duration-300`} />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="max-w-4xl mx-auto text-center mb-8 md:mb-12 animate-fade-in-up">
            <h1 className={`${theme.heroTitle} ${theme.heroTitleSize} font-bold mb-4 md:mb-6 leading-tight animate-fade-in`}>
              {heroTitle}
            </h1>
            <p className={`${theme.heroSubtitle} ${theme.heroSubtitleSize} max-w-2xl mx-auto animate-fade-in-delay`}>
              {heroSubtitle}
            </p>
          </div>

          {/* Search Card - Centered */}
          <div className="max-w-5xl mx-auto animate-fade-in-up-delay">
            <Card className={`${theme.searchCard} ${theme.searchCardShadow} ${theme.searchCardBorder} p-6 md:p-8 rounded-2xl transition-all duration-300 hover:scale-[1.01]`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Check-in e Check-out - DateRangePicker */}
                <div className="space-y-2 sm:col-span-2">
                  <Label className={`text-sm font-medium ${theme.textSecondary} flex items-center gap-2`}>
                    <CalendarDays className="w-4 h-4" />
                    Check-in e checkout
                  </Label>
                  <DateRangePicker
                    checkin={checkin}
                    checkout={checkout}
                    onCheckinChange={setCheckin}
                    onCheckoutChange={setCheckout}
                    onClear={() => {
                      setCheckin("");
                      setCheckout("");
                    }}
                    onSearch={handleSubmit}
                    theme={{
                      searchInputBg: theme.searchInputBg,
                      searchInputBorder: theme.searchInputBorder,
                      searchInputText: theme.searchInputText,
                      searchInputFocus: theme.searchInputFocus,
                      textSecondary: theme.textSecondary,
                      primaryButton: theme.primaryButton,
                      primaryButtonHover: theme.primaryButtonHover,
                      secondaryButton: theme.secondaryButton,
                      secondaryButtonHover: theme.secondaryButtonHover,
                    }}
                    maxNights={365}
                  />
                </div>

                {/* Adultos */}
                <div className="space-y-2">
                  <Label className={`text-sm font-medium ${theme.textSecondary} flex items-center gap-2`}>
                    <Users className="w-4 h-4" />
                    Adultos
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={adults}
                    onChange={(e) => setAdults(e.target.value)}
                    className={`h-12 ${theme.searchInputBg} ${theme.searchInputBorder} border ${theme.searchInputText} ${theme.searchInputFocus} rounded-lg`}
                  />
                </div>

                {/* Crianças */}
                <div className="space-y-2">
                  <Label className={`text-sm font-medium ${theme.textSecondary} flex items-center gap-2`}>
                    <Users className="w-4 h-4" />
                    Crianças
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={children}
                    onChange={(e) => setChildren(e.target.value)}
                    className={`h-12 ${theme.searchInputBg} ${theme.searchInputBorder} border ${theme.searchInputText} ${theme.searchInputFocus} rounded-lg`}
                  />
                </div>

                {/* CTA Button */}
                <div className="flex items-end">
                  <Button
                    className={`w-full h-12 ${theme.primaryButton} ${theme.primaryButtonHover} rounded-lg font-semibold text-base flex items-center justify-center gap-2`}
                    onClick={handleSubmit}
                  >
                    <Search className="w-5 h-5" />
                    <span className="hidden sm:inline">Ver disponibilidade</span>
                    <span className="sm:hidden">Buscar</span>
                  </Button>
                </div>
              </div>

              {/* Cupom de desconto */}
              <div className="mt-4 pt-4 border-t border-slate-200/50">
                <div className="flex items-center gap-3">
                  <Label className={`text-sm font-medium ${theme.textSecondary} flex items-center gap-2 whitespace-nowrap`}>
                    <Percent className="w-4 h-4" />
                    Cupom
                  </Label>
                  <Input
                    placeholder="Código promocional (opcional)"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    className={`flex-1 h-10 ${theme.searchInputBg} ${theme.searchInputBorder} border ${theme.searchInputText} ${theme.searchInputFocus} rounded-lg uppercase tracking-wide`}
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        {/* Filtro por Cidade - Botões Elegantes (Estilo Airbnb) */}
        {availableCities.length > 0 && companyEstablishments.length > 1 && (
          <div className="mb-12">
            <h2 className={`text-2xl font-bold mb-6 ${theme.textPrimary}`}>
              Selecione uma cidade
            </h2>
            <div className="flex flex-wrap gap-3 mb-8">
              {/* Botão "Todas as cidades" */}
              <button
                onClick={() => setSelectedCity("all")}
                className={`px-6 py-3 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
                  selectedCity === "all"
                    ? "bg-black text-white shadow-md hover:shadow-lg"
                    : "bg-white text-gray-700 border border-gray-300 hover:border-gray-400 hover:shadow-sm"
                }`}
              >
                <MapPin className="w-4 h-4" />
                Todas as cidades
                {selectedCity === "all" && (
                  <CheckCircle2 className="w-4 h-4" />
                )}
              </button>

              {/* Botões das cidades */}
              {availableCities.map((city: string) => {
                const isSelected = selectedCity === city;
                return (
                  <button
                    key={city}
                    onClick={() => setSelectedCity(city)}
                    className={`px-6 py-3 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
                      isSelected
                        ? "bg-black text-white shadow-md hover:shadow-lg"
                        : "bg-white text-gray-700 border border-gray-300 hover:border-gray-400 hover:shadow-sm"
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                    {city}
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Estabelecimentos da empresa */}
        {companyEstablishments.length > 1 && (
          <div className="mb-12">
            <h2 className={`text-2xl font-bold mb-6 ${theme.textPrimary}`}>
                {t("bookingEngine.establishments.title")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEstablishments.map((est: any) => {
                const isSelected = selectedEstablishmentId === est.id;
                const estWithData = establishmentsWithCities.find((e: any) => e.id === est.id);
                const city = estWithData?.city;
                const photo = estWithData?.photo;
                const typeLabel = est.type === 'hotel' ? 'Hotel' : est.type === 'apartment' ? 'Apartamento' : 'Outro';
                
                return (
                  <Card
                    key={est.id}
                    className={`overflow-hidden cursor-pointer transition-all duration-200 ${theme.cardBg} ${theme.cardBorder} ${theme.cardShadow} ${
                      isSelected 
                        ? `ring-2 ring-offset-2 ring-blue-500 ${theme.accentBorder} border-2` 
                        : `hover:shadow-lg hover:scale-[1.02]`
                    }`}
                    onClick={() => {
                      // Se já está selecionado, desmarcar. Caso contrário, selecionar
                      if (isSelected) {
                        setSelectedEstablishmentId(null);
                        setEstablishment(null);
                      } else {
                        setSelectedEstablishmentId(est.id);
                        setEstablishment(est);
                      }
                      setSelectedRoomId(null);
                      setSelectedPlanId(null);
                    }}
                  >
                    {/* Foto do estabelecimento */}
                    <div className="relative w-full h-48 bg-slate-200 overflow-hidden">
                      {photo ? (
                        <img
                          src={photo}
                          alt={est.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80";
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                          <MapPin className="w-12 h-12 text-slate-400" />
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-3 right-3">
                          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                            <CheckCircle2 className="w-5 h-5 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Informações do estabelecimento */}
                    <div className="p-5 space-y-3">
                      <div>
                        <h3 className={`font-semibold text-lg mb-1 ${theme.textPrimary}`}>
                          {est.name}
                        </h3>
                        {city && (
                          <div className="flex items-center gap-1.5 text-sm mb-2">
                            <MapPin className={`w-3.5 h-3.5 ${theme.textMuted}`} />
                            <p className={theme.textMuted}>{city}</p>
                          </div>
                        )}
                        {est.type && (
                          <div className="inline-flex items-center">
                            <Badge 
                              variant="outline" 
                              className={`text-xs font-medium ${theme.textMuted} border-gray-300`}
                            >
                              {typeLabel}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-8 lg:gap-12">
          {/* Room Cards List */}
          <div className="space-y-12">
            {selectedCity !== "all" && filteredEstablishments.length === 0 && (
              <Card className={`p-8 text-center ${theme.cardBg} ${theme.cardBorder} ${theme.cardShadow}`}>
                <p className={`${theme.textSecondary} text-lg`}>
                  Nenhum estabelecimento encontrado nesta cidade.
                </p>
              </Card>
            )}

            {roomsLoading && (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className={`${theme.cardBg} ${theme.cardBorder} ${theme.cardShadow} overflow-hidden`}>
                    <div className="animate-pulse">
                      <div className="h-64 bg-slate-200 dark:bg-slate-700" />
                      <div className="p-6 space-y-4">
                        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {!roomsLoading && Object.keys(categoriesByEstablishment).length === 0 && !roomsLoading && (
              <Card className={`p-8 text-center ${theme.cardBg} ${theme.cardBorder} ${theme.cardShadow}`}>
                <p className={`${theme.textSecondary} text-lg`}>
                  Nenhuma categoria disponível no momento.
                </p>
              </Card>
            )}

            {!roomsLoading && Object.entries(categoriesByEstablishment).map(([establishmentId, { establishment, categories }]) => {
              // Filtrar rooms para este estabelecimento
              const establishmentRooms = rooms.filter((room: any) => {
                const category = roomCategories.find((cat: any) => cat.id === room.categoryId);
                return category && category.establishment_id === establishmentId;
              });

              if (establishmentRooms.length === 0) return null;

              const estWithData = establishmentsWithCities.find((e: any) => e.id === establishmentId);
              const city = estWithData?.city;

              return (
                <div key={establishmentId} className="space-y-6">
                  {/* Cabeçalho do Estabelecimento */}
                  <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
                    <div className="flex-1">
                      <h2 className={`text-2xl md:text-3xl font-bold ${theme.textPrimary} mb-1`}>
                        {establishment.name}
                      </h2>
                      {city && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className={`w-4 h-4 ${theme.textMuted}`} />
                          <p className={theme.textMuted}>{city}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Categorias do Estabelecimento */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {establishmentRooms.map((room, index) => (
              <Card
                key={room.id}
                className={`overflow-hidden ${theme.roomCardBg} ${theme.roomCardBorder} ${theme.roomCardShadow} ${theme.cardHover} ${theme.cardHoverShadow} transition-all duration-300 animate-fade-in-up`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Room Image - 16:9 Aspect Ratio */}
                <div className="relative w-full h-64 md:h-80 lg:h-96 overflow-hidden">
                  <img
                    src={room.image}
                    alt={room.name}
                    className="w-full h-full object-cover"
                  />
                  <div className={`absolute inset-0 ${theme.roomImageOverlay || ""}`} />
                  
                  {/* Badge de destaque */}
                  {room.highlight && (
                    <div className="absolute top-4 left-4 z-10">
                      <Badge className={`${theme.badgePrimary} px-3 py-1.5 text-sm font-semibold`}>
                        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                        {room.highlight}
                      </Badge>
                    </div>
                  )}

                  {/* Price Badge */}
                  {room.plans[0] && (
                    <div className="absolute bottom-4 right-4 z-10">
                      <div className={`${theme.cardBg} ${theme.cardBorder} border rounded-lg px-4 py-2 shadow-lg`}>
                        {room.plans[0].pricePerNight > 0 ? (
                          <>
                        <div className={`text-xs ${theme.textMuted} mb-0.5`}>A partir de</div>
                        <div className={`${theme.priceColor} text-xl font-bold`}>
                          R$ {room.plans[0].pricePerNight.toFixed(2)}
                        </div>
                        <div className={`text-xs ${theme.priceLabel}`}>por noite</div>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <div className="h-3 w-20 bg-slate-200/70 dark:bg-slate-700/60 rounded-full animate-pulse" />
                            <div className="h-4 w-28 bg-slate-200/80 dark:bg-slate-700/70 rounded-full animate-pulse" />
                            <div className={`text-[11px] ${theme.textMuted}`}>
                              Selecione datas para ver o preço
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Room Info */}
                <div className="p-6 md:p-8">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className={`text-2xl md:text-3xl font-bold mb-2 ${theme.textPrimary}`}>
                        {room.name}
                      </h3>
                      <div className={`flex flex-wrap items-center gap-4 text-sm ${theme.textSecondary}`}>
                        {room.size && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4" />
                            <span>{room.size}</span>
                          </div>
                        )}
                        {room.capacity && (
                          <div className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            <span>{room.capacity}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {themeKey === "luxury" && (
                      <Crown className="w-6 h-6 text-purple-400 flex-shrink-0 ml-4" />
                    )}
                  </div>

                  {/* Amenities */}
                  {room.amenities.length > 0 && (
                    <div className="mb-6">
                      <div className="flex flex-wrap gap-2">
                        {room.amenities.slice(0, 8).map((amenity) => (
                          <Badge
                            key={amenity}
                            variant="outline"
                            className={`text-xs px-3 py-1 ${theme.badgeSecondary}`}
                          >
                            {amenity}
                          </Badge>
                        ))}
                        {room.amenities.length > 8 && (
                          <Badge
                            variant="outline"
                            className={`text-xs px-3 py-1 ${theme.badgeSecondary}`}
                          >
                            +{room.amenities.length - 8} mais
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="mb-6 space-y-3">
                    <Button
                      className={`w-full ${theme.primaryButton} ${theme.primaryButtonHover} border-2`}
                      onClick={() => {
                        handleSubmit(room.categoryId);
                      }}
                      disabled={!checkin || !checkout || nights <= 0}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Ver disponibilidade
                    </Button>
                    <Button
                      variant="outline"
                      className={`w-full ${theme.secondaryButton} ${theme.secondaryButtonHover} border-2`}
                      onClick={() => {
                        const params = new URLSearchParams();
                        if (checkin) params.set("checkin", checkin);
                        if (checkout) params.set("checkout", checkout);
                        if (adults) params.set("adults", adults);
                        if (children) params.set("children", children);
                        if (coupon) params.set("coupon", coupon);
                        // Se não houver companySlug (domínio personalizado), usar rota sem /motor/
                        const categoryPath = companySlug 
                          ? `/motor/${companySlug}/categoria/${room.categoryId}`
                          : `/categoria/${room.categoryId}`;
                        navigate(`${categoryPath}?${params.toString()}`);
                      }}
                    >
                      Saiba mais
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>

                  {/* Pricing Plans Accordion */}
                  <div>
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="plans" className="border-0">
                        <AccordionTrigger className={`${theme.textPrimary} hover:no-underline py-4`}>
                          <span className="text-base font-semibold">Ver planos tarifários e preços</span>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 sm:pt-4">
                          <div className="space-y-3 sm:space-y-4">
                            {room.plans.map((plan) => {
                              const isSelected = selectedPlanId === plan.id && selectedRoomId === room.id;
                              return (
                                <button
                                  key={plan.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedRoomId(room.id);
                                    setSelectedPlanId(plan.id);
                                  }}
                                  className={`w-full text-left p-4 sm:p-5 rounded-xl transition-all duration-200 ${
                                    isSelected
                                      ? `${theme.planCardSelected}`
                                      : `${theme.planCardBg} ${theme.planCardBorder} border ${theme.planCardHover}`
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                    <div className="flex-1 space-y-2 sm:space-y-3">
                                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                        <span className={`text-base sm:text-lg font-bold ${theme.textPrimary}`}>
                                          {plan.name}
                                        </span>
                                        {plan.tag && (
                                          <Badge className={`${theme.badgePrimary} text-xs px-2 py-0.5`}>
                                            <Star className="w-3 h-3 mr-1" />
                                            {plan.tag}
                                          </Badge>
                                        )}
                                      </div>
                                      <p className={`text-xs sm:text-sm ${theme.textSecondary} line-clamp-2`}>
                                        {plan.description}
                                      </p>
                                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                        {plan.benefits.map((benefit, idx) => (
                                          <div
                                            key={idx}
                                            className={`flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full ${theme.badgeSecondary}`}
                                          >
                                            <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                                            <span className="truncate">{benefit}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div className={`text-left sm:text-right flex-shrink-0 ${plan.pricePerNight > 0 && nights > 0 ? 'sm:min-w-[160px] lg:min-w-[180px]' : 'sm:min-w-[180px] lg:min-w-[200px]'}`}>
                                      <div className={`${theme.priceColor} text-xl sm:text-2xl font-bold mb-1`}>
                                        {plan.pricePerNight > 0 && nights > 0 ? (
                                          <>R$ {plan.pricePerNight.toFixed(2)}</>
                                        ) : (
                                          <span className="text-xs sm:text-sm text-slate-400">Selecione datas</span>
                                        )}
                                      </div>
                                      <div className={`text-[10px] sm:text-xs ${theme.priceLabel} ${plan.pricePerNight > 0 && nights > 0 ? 'whitespace-nowrap' : 'flex items-center gap-1 justify-end sm:justify-end'}`}>
                                        {plan.pricePerNight > 0 && nights > 0 ? (
                                          "por noite"
                                        ) : (
                                          <>
                                            <span className="truncate">Selecione datas</span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setShowPriceInfoDialog(true);
                                              }}
                                              className="flex-shrink-0 hover:opacity-70 transition-opacity"
                                              aria-label="Informações sobre preços"
                                            >
                                              <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                      {plan.pricePerNight > 0 && nights > 0 && (
                                        <div className={`text-xs sm:text-sm ${theme.textMuted} mt-1 sm:mt-2 whitespace-nowrap`}>
                                          {nights} noite{nights > 1 ? "s" : ""}: R$ {(plan.pricePerNight * nights).toFixed(2)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </div>
              </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary Sidebar - Sticky */}
          <div className="lg:sticky lg:top-24 h-fit">
            <Card className={`${theme.summaryBg} ${theme.summaryBorder} ${theme.summaryShadow} p-6 rounded-2xl`}>
              <h3 className={`text-xl font-bold mb-6 ${theme.textPrimary}`}>
                Resumo da busca
              </h3>
              
              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-slate-200/50">
                  <span className={`text-sm ${theme.textSecondary}`}>Check-in</span>
                  <span className={`font-semibold ${theme.textPrimary}`}>
                    {checkin ? formatDateDisplay(checkin) : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200/50">
                  <span className={`text-sm ${theme.textSecondary}`}>Check-out</span>
                  <span className={`font-semibold ${theme.textPrimary}`}>
                    {checkout ? formatDateDisplay(checkout) : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200/50">
                  <span className={`text-sm ${theme.textSecondary}`}>Noites</span>
                  <span className={`font-semibold ${theme.textPrimary}`}>
                    {nights > 0 ? `${nights} noite${nights > 1 ? 's' : ''}` : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-200/50">
                  <span className={`text-sm ${theme.textSecondary}`}>Hóspedes</span>
                  <span className={`font-semibold ${theme.textPrimary}`}>
                    {adults} adulto{Number(adults) > 1 ? 's' : ''}
                    {Number(children) > 0 && ` · ${children} criança${Number(children) > 1 ? 's' : ''}`}
                  </span>
                </div>
              </div>

              {selectedRoom && (
                <div className={`p-4 rounded-xl mb-6 ${theme.accentBg} ${theme.accentBorder} border`}>
                  <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${theme.textMuted}`}>
                    Seleção atual
                  </div>
                  <div className={`font-semibold mb-1 ${theme.textPrimary}`}>
                    {selectedRoom.name}
                  </div>
                  {selectedPlan && (
                    <div className={`text-sm ${theme.textSecondary}`}>
                      {selectedPlan.name}
                    </div>
                  )}
                </div>
              )}

              {totalAmount !== null && (
                <div className={`p-4 rounded-xl mb-6 ${theme.accentBg} ${theme.accentBorder} border`}>
                  <div className="flex justify-between items-baseline mb-2">
                    <span className={`text-sm ${theme.textSecondary}`}>Total estimado</span>
                    <span className={`${theme.priceHighlight} text-2xl`}>
                      R$ {totalAmount.toFixed(2)}
                    </span>
                  </div>
                  <p className={`text-xs ${theme.textMuted}`}>
                    Para {nights} noite{nights > 1 ? 's' : ''}. Valor final calculado na próxima etapa.
                  </p>
                </div>
              )}

              <Button
                className={`w-full h-14 ${theme.primaryButton} ${theme.primaryButtonHover} rounded-xl font-semibold text-base flex items-center justify-center gap-2 mb-4`}
                onClick={() => {
                  // selectedRoomId é o categoryId (id da categoria)
                  // Se há uma categoria selecionada, usar seu ID
                  if (selectedRoomId) {
                    handleSubmit(selectedRoomId);
                  } else if (selectedRoom?.id) {
                    // Fallback: usar o ID do selectedRoom se existir
                    handleSubmit(selectedRoom.id);
                  } else {
                    // Se não há categoria selecionada, não fazer nada
                    handleSubmit();
                  }
                }}
                disabled={!checkin || !checkout || nights <= 0 || !selectedRoomId}
              >
                <Search className="w-5 h-5" />
                Continuar para reserva
              </Button>

              <p className={`text-xs text-center ${theme.textMuted}`}>
                Na próxima página você verá disponibilidade em tempo real, tarifas detalhadas e poderá finalizar a reserva com segurança.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer - estilo moderno inspirado em Booking / Airbnb / Expedia */}
      <footer className={`${theme.footerBg} ${theme.footerBorder} mt-16`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          {/* Linha principal */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Coluna 1 - Marca */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {motorLogo && (
                  <div className="h-9 w-9 rounded-full bg-white/90 shadow-sm flex items-center justify-center overflow-hidden ring-1 ring-black/5">
                    <img
                      src={motorLogo}
                      alt="Logo"
                      className="h-7 w-7 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
                <div className="flex flex-col">
                  <span
                    className={`text-sm font-semibold tracking-tight ${
                      themeKey === "travel" ? "text-white" : theme.textPrimary
                    }`}
                  >
                    {motorTitle}
                  </span>
                  <span className={`text-xs ${theme.footerText}`}>
                    Motor de reservas oficial · reserva direta, sem taxas ocultas
                  </span>
                </div>
              </div>
              {contactCnpj && (
                <p className={`text-xs ${theme.footerText}`}>CNPJ: {contactCnpj}</p>
              )}
            </div>

            {/* Coluna 2 - Contato */}
            <div className="space-y-3">
              <h5
                className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                  themeKey === "travel" ? "text-white" : theme.textSecondary
                }`}
              >
                Contato
              </h5>
              <div className="space-y-2 text-sm">
                {contactPhone && (
                  <p className={`flex items-center gap-2 ${theme.footerText}`}>
                    <Phone className="w-4 h-4 opacity-70" />
                    <a href={`tel:${contactPhone}`} className="hover:underline">
                      {contactPhone}
                    </a>
                  </p>
                )}
                {contactWhatsappNumber && (
                  <p className={`flex items-center gap-2 ${theme.footerText}`}>
                    <MessageCircle className="w-4 h-4 opacity-70" />
                    <a
                      href={`https://wa.me/${encodeURIComponent(`${contactWhatsappDdi || ""}${contactWhatsappNumber}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {`${contactWhatsappDdi || ""} ${contactWhatsappNumber}`.trim()}
                    </a>
                  </p>
                )}
                {contactEmail && (
                  <p className={`flex items-center gap-2 ${theme.footerText}`}>
                    <Mail className="w-4 h-4 opacity-70" />
                    <a href={`mailto:${contactEmail}`} className="hover:underline">
                      {contactEmail}
                    </a>
                  </p>
                )}
              </div>
            </div>

            {/* Coluna 3 - Experiência & tecnologia */}
            <div className="space-y-3 md:text-right">
              <h5 className={`text-xs font-semibold uppercase tracking-[0.18em] ${themeKey === "travel" ? "text-white" : theme.textSecondary}`}>
                Experiência segura
              </h5>
              <p className={`text-sm ${theme.footerText}`}>
                Pagamentos criptografados, disponibilidade em tempo real e confirmação imediata da sua reserva.
              </p>
              <div className={`inline-flex items-center gap-2 text-xs mt-2 md:justify-end ${themeKey === "travel" ? "text-blue-100" : "text-slate-400"}`}>
                <Globe2 className="w-3 h-3" />
                <span>Tecnologia SaaS para hospitalidade</span>
              </div>
            </div>
          </div>

          {/* Redes sociais */}
          {(socialInstagram || socialFacebook || socialTwitter || socialYoutube || socialWebsite || socialWhatsapp) && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <span className={`text-[11px] ${theme.footerText}`}>Siga-nos:</span>
              {socialInstagram && (
                <a
                  href={socialInstagram}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="Instagram"
                >
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {socialFacebook && (
                <a
                  href={socialFacebook}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="Facebook"
                >
                  <Facebook className="w-4 h-4" />
                </a>
              )}
              {socialTwitter && (
                <a
                  href={socialTwitter}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="Twitter / X"
                >
                  <Twitter className="w-4 h-4" />
                </a>
              )}
              {socialYoutube && (
                <a
                  href={socialYoutube}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="YouTube"
                >
                  <Youtube className="w-4 h-4" />
                </a>
              )}
              {socialWhatsapp && (
                <a
                  href={socialWhatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              )}
              {socialWebsite && (
                <a
                  href={socialWebsite}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${theme.footerBorder}`}
                >
                  <Globe2 className="w-3 h-3" />
                  <span>Site oficial</span>
                </a>
              )}
            </div>
          )}

          {/* Linha inferior */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-4 border-t border-white/5 border-slate-200/10">
              <p className={`text-[11px] ${theme.footerText}`}>
              © {new Date().getFullYear()} {motorTitle}. Todos os direitos reservados.
              </p>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <span>Idioma: Português (Brasil)</span>
              <span className="hidden md:inline-block w-px h-3 bg-slate-700/40" />
              <span>Moeda: BRL (R$)</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Sticky CTA Mobile */}
      <div className={`lg:hidden fixed inset-x-0 bottom-0 z-50 ${theme.summaryBg} ${theme.summaryBorder} border-t px-4 py-4 backdrop-blur-md shadow-2xl`}>
        <Button
          className={`w-full h-14 ${theme.primaryButton} ${theme.primaryButtonHover} rounded-xl font-semibold text-base flex items-center justify-center gap-2`}
          onClick={() => handleSubmit()}
          disabled={!checkin || !checkout || nights <= 0 || !selectedRoomId}
        >
          <Search className="w-5 h-5" />
          Ver disponibilidade
        </Button>
      </div>

      {/* Dialog para seleção de estabelecimento */}
      <Dialog open={showEstablishmentDialog} onOpenChange={setShowEstablishmentDialog}>
        <DialogContent className={`${theme.cardBg} ${theme.cardBorder} max-w-2xl`}>
          <DialogHeader>
            <DialogTitle className={theme.textPrimary}>
              Selecione um estabelecimento
            </DialogTitle>
            <DialogDescription className={theme.textSecondary}>
              Esta categoria está disponível em múltiplos estabelecimentos. Escolha qual deseja verificar a disponibilidade.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {pendingCategoryId && (() => {
              const category = roomCategories.find((cat: any) => cat.id === pendingCategoryId);
              if (!category) return null;
              
              // Encontrar todos os estabelecimentos que têm essa categoria (mesmo nome)
              const categoriesWithSameName = roomCategories.filter(
                (cat: any) => cat.name === category.name
              );
              const establishmentIds = [...new Set(categoriesWithSameName.map((cat: any) => cat.establishment_id))];
              const establishmentsForCategory = companyEstablishments.filter((est: any) => 
                establishmentIds.includes(est.id)
              );

              return establishmentsForCategory.map((est: any) => {
                const estWithData = establishmentsWithCities.find((e: any) => e.id === est.id);
                const city = estWithData?.city;
                const photo = estWithData?.photo;
                const typeLabel = est.type === 'hotel' ? 'Hotel' : est.type === 'apartment' ? 'Apartamento' : 'Outro';

                return (
                  <Card
                    key={est.id}
                    className={`overflow-hidden cursor-pointer transition-all duration-200 ${theme.cardBg} ${theme.cardBorder} ${theme.cardShadow} hover:shadow-lg hover:scale-[1.02]`}
                    onClick={() => handleSelectEstablishmentForCategory(est.id)}
                  >
                    <div className="flex gap-4 p-4">
                      {/* Foto do estabelecimento */}
                      <div className="relative w-24 h-24 bg-slate-200 overflow-hidden rounded-lg flex-shrink-0">
                        {photo ? (
                          <img
                            src={photo}
                            alt={est.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                            <MapPin className="w-8 h-8 text-slate-400" />
                          </div>
                        )}
                      </div>
                      
                      {/* Informações do estabelecimento */}
                      <div className="flex-1 space-y-2">
                        <div>
                          <h3 className={`font-semibold text-lg mb-1 ${theme.textPrimary}`}>
                            {est.name}
                          </h3>
                          {city && (
                            <div className="flex items-center gap-1.5 text-sm mb-2">
                              <MapPin className={`w-3.5 h-3.5 ${theme.textMuted}`} />
                              <p className={theme.textMuted}>{city}</p>
                            </div>
                          )}
                          {est.type && (
                            <div className="inline-flex items-center">
                              <Badge 
                                variant="outline" 
                                className={`text-xs font-medium ${theme.textMuted} border-gray-300`}
                              >
                                {typeLabel}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Ícone de seta */}
                      <div className="flex items-center">
                        <ArrowRight className={`w-5 h-5 ${theme.textMuted}`} />
                      </div>
                    </div>
                  </Card>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para busca de estabelecimentos */}
      <Dialog open={showSearchEstablishmentDialog} onOpenChange={setShowSearchEstablishmentDialog}>
        <DialogContent className={`${theme.cardBg} ${theme.cardBorder} max-w-4xl max-h-[90vh] overflow-hidden flex flex-col`}>
          <DialogHeader>
            <DialogTitle className={theme.textPrimary}>
              Buscar Quarto
            </DialogTitle>
            <DialogDescription className={theme.textSecondary}>
              Selecione um estabelecimento para verificar disponibilidade e fazer sua reserva.
            </DialogDescription>
          </DialogHeader>
          
          {/* Filtro por cidade */}
          {availableCities.length > 0 && (
            <div className="mt-4 mb-4">
              <Label className={`text-sm font-medium mb-3 block ${theme.textSecondary}`}>
                Filtrar por cidade
              </Label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSearchDialogCity("all")}
                  className={`px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
                    searchDialogCity === "all"
                      ? "bg-black text-white shadow-md hover:shadow-lg"
                      : "bg-white text-gray-700 border border-gray-300 hover:border-gray-400 hover:shadow-sm"
                  }`}
                >
                  <MapPin className="w-4 h-4" />
                  Todas as cidades
                  {searchDialogCity === "all" && (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                </button>
                {availableCities.map((city: string) => {
                  const isSelected = searchDialogCity === city;
                  return (
                    <button
                      key={city}
                      onClick={() => setSearchDialogCity(city)}
                      className={`px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
                        isSelected
                          ? "bg-black text-white shadow-md hover:shadow-lg"
                          : "bg-white text-gray-700 border border-gray-300 hover:border-gray-400 hover:shadow-sm"
                      }`}
                    >
                      <MapPin className="w-4 h-4" />
                      {city}
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lista de estabelecimentos */}
          <div className="mt-4 space-y-3 overflow-y-auto flex-1">
            {(() => {
              // Filtrar estabelecimentos por cidade selecionada no diálogo
              const filteredEstsForDialog = searchDialogCity === "all"
                ? companyEstablishments
                : companyEstablishments.filter((est: any) => {
                    const estWithData = establishmentsWithCities.find((e: any) => e.id === est.id);
                    return estWithData?.city === searchDialogCity;
                  });

              if (filteredEstsForDialog.length === 0) {
                return (
                  <Card className={`p-8 text-center ${theme.cardBg} ${theme.cardBorder} ${theme.cardShadow}`}>
                    <p className={`${theme.textSecondary} text-lg`}>
                      Nenhum estabelecimento encontrado{searchDialogCity !== "all" ? ` em ${searchDialogCity}` : ""}.
                    </p>
                  </Card>
                );
              }

              return filteredEstsForDialog.map((est: any) => {
                const estWithData = establishmentsWithCities.find((e: any) => e.id === est.id);
                const city = estWithData?.city;
                const photo = estWithData?.photo;
                const typeLabel = est.type === 'hotel' ? 'Hotel' : est.type === 'apartment' ? 'Apartamento' : 'Outro';

                const handleSelectEstablishment = () => {
                  const estAny = est as any;
                  const slug = estAny.slug || estAny.numeric_id?.toString() || estAny.id;

                  const params = new URLSearchParams();
                  if (checkin) params.set("checkin", checkin);
                  if (checkout) params.set("checkout", checkout);
                  if (adults) params.set("adults", adults);
                  if (children) params.set("children", children);
                  if (coupon) params.set("coupon", coupon);

                  setShowSearchEstablishmentDialog(false);
                  navigate(`/reservar/${slug}?${params.toString()}`);
                };

                return (
                  <Card
                    key={est.id}
                    className={`overflow-hidden cursor-pointer transition-all duration-200 ${theme.cardBg} ${theme.cardBorder} ${theme.cardShadow} hover:shadow-lg hover:scale-[1.01]`}
                    onClick={handleSelectEstablishment}
                  >
                    <div className="flex gap-4 p-4">
                      {/* Foto do estabelecimento */}
                      <div className="relative w-32 h-32 bg-slate-200 overflow-hidden rounded-lg flex-shrink-0">
                        {photo ? (
                          <img
                            src={photo}
                            alt={est.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                            <MapPin className="w-10 h-10 text-slate-400" />
                          </div>
                        )}
                      </div>
                      
                      {/* Informações do estabelecimento */}
                      <div className="flex-1 space-y-2">
                        <div>
                          <h3 className={`font-semibold text-xl mb-1 ${theme.textPrimary}`}>
                            {est.name}
                          </h3>
                          {city && (
                            <div className="flex items-center gap-1.5 text-sm mb-2">
                              <MapPin className={`w-4 h-4 ${theme.textMuted}`} />
                              <p className={theme.textMuted}>{city}</p>
                            </div>
                          )}
                          {est.type && (
                            <div className="inline-flex items-center">
                              <Badge 
                                variant="outline" 
                                className={`text-xs font-medium ${theme.textMuted} border-gray-300`}
                              >
                                {typeLabel}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Ícone de seta */}
                      <div className="flex items-center">
                        <ArrowRight className={`w-6 h-6 ${theme.textMuted}`} />
                      </div>
                    </div>
                  </Card>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de informações sobre preços */}
      <Dialog open={showPriceInfoDialog} onOpenChange={setShowPriceInfoDialog}>
        <DialogContent className={`${theme.cardBg} ${theme.cardBorder} max-w-md`}>
          <DialogHeader>
            <DialogTitle className={`${theme.textPrimary} flex items-center gap-2`}>
              <Info className="w-5 h-5" />
              Informações sobre Preços
            </DialogTitle>
            <DialogDescription className={theme.textSecondary}>
              Os valores serão exibidos após escolher datas e hóspedes
            </DialogDescription>
          </DialogHeader>
          <div className={`mt-4 ${theme.textSecondary} text-sm space-y-2`}>
            <p>
              Para visualizar os preços e disponibilidade dos quartos, é necessário:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Selecionar as datas de check-in e check-out</li>
              <li>Informar o número de adultos e crianças</li>
            </ul>
            <p className="mt-3">
              Após preencher essas informações, os valores serão calculados automaticamente com base nas tarifas configuradas para o período selecionado.
            </p>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => setShowPriceInfoDialog(false)}
              className={`${theme.primaryButton} ${theme.primaryButtonHover}`}
            >
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
};

export default BookingEnginePage;
