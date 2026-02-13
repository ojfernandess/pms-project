/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import { batchCalculateRatePrice } from "@/utils/ratePriceBatch";

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
import { CalendarDays, Users, Percent, Search, Star, Crown, Sparkles, MapPin, CheckCircle2, Phone, Mail, MessageCircle, Globe2, Instagram, Facebook, Twitter, Youtube, Linkedin, ArrowRight, Info, ChevronLeft, ChevronRight, SlidersHorizontal, ChevronDown, Minus, Plus, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  
  @keyframes pulse-ring {
    0% {
      transform: scale(0.8);
      opacity: 1;
    }
    50% {
      transform: scale(1.2);
      opacity: 0.5;
    }
    100% {
      transform: scale(1.5);
      opacity: 0;
    }
  }

  @keyframes pulse-button {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  /* O botão nativo do Chatwoot será controlado via JavaScript baseado no estilo escolhido */
  /* NÃO esconder #woot-widget-holder pois precisamos detectar quando está aberto */

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
  const [establishmentsPageIndex, setEstablishmentsPageIndex] = useState(0);
  const [showSearchReservationDialog, setShowSearchReservationDialog] = useState(false);
  const [reservationSearchData, setReservationSearchData] = useState({
    locator: "",
    name: "",
    phone: "",
  });
  const [searchingReservation, setSearchingReservation] = useState(false);
  const [chatwootWidgetOpen, setChatwootWidgetOpen] = useState(false);

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
  const socialLinkedin = company?.booking_engine_social_linkedin || null;
  const socialWebsite = company?.booking_engine_social_website || null;
  const socialWhatsapp = company?.booking_engine_social_whatsapp || null;

  // Chat (Chatwoot ou WhatsApp)
  const chatEnabled = company?.booking_engine_chat_enabled || false;
  const chatType = company?.booking_engine_chat_type || "chatwoot";
  const chatBaseUrl = company?.booking_engine_chat_base_url || null;
  const chatWebsiteToken = company?.booking_engine_chat_website_token || null;
  const chatButtonStyle = company?.booking_engine_chat_button_style || "custom";
  const whatsappDdi = company?.booking_engine_contact_whatsapp_ddi || null;
  const whatsappNumber = company?.booking_engine_contact_whatsapp_number || null;

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

  // Carregar Chatwoot quando habilitado (apenas se tipo for chatwoot)
  useEffect(() => {
    // Se não estiver habilitado, ou for WhatsApp, ou faltar configuração do Chatwoot, remover script
    if (!chatEnabled || chatType !== "chatwoot" || !chatBaseUrl || !chatWebsiteToken) {
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
  }, [chatEnabled, chatType, chatBaseUrl, chatWebsiteToken]);

  // Esconder o botão nativo do Chatwoot apenas quando o estilo for "custom"
  useEffect(() => {
    if (chatEnabled && chatType === "chatwoot" && chatBaseUrl && chatWebsiteToken && chatButtonStyle === "custom") {
      // Função para esconder o botão nativo do Chatwoot
      const hideNativeChatwootButton = () => {
        const nativeButton = document.querySelector('.woot-widget-bubble') as HTMLElement;
        const nativeWidget = document.querySelector('[data-chatwoot-widget]') as HTMLElement;
        
        if (nativeButton) {
          nativeButton.style.display = 'none';
        }
        if (nativeWidget) {
          nativeWidget.style.display = 'none';
        }
        // NÃO esconder #woot-widget-holder pois precisamos detectar quando está aberto
      };

      // Esconder imediatamente
      hideNativeChatwootButton();

      // Observar mudanças no DOM para esconder quando o Chatwoot criar o botão
      const observer = new MutationObserver(hideNativeChatwootButton);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Verificar periodicamente
      const interval = setInterval(hideNativeChatwootButton, 500);

      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    } else if (chatEnabled && chatType === "chatwoot" && chatBaseUrl && chatWebsiteToken && chatButtonStyle === "native") {
      // Quando for "native", garantir que o botão nativo esteja visível
      const showNativeChatwootButton = () => {
        const nativeButton = document.querySelector('.woot-widget-bubble') as HTMLElement;
        const nativeWidget = document.querySelector('[data-chatwoot-widget]') as HTMLElement;
        
        if (nativeButton) {
          // Usar setProperty com !important para sobrescrever qualquer CSS
          nativeButton.style.setProperty('display', '', 'important');
          nativeButton.style.setProperty('visibility', 'visible', 'important');
          nativeButton.style.setProperty('opacity', '1', 'important');
          // Remover qualquer classe que possa estar escondendo
          nativeButton.classList.remove('woot--hide');
        }
        if (nativeWidget) {
          nativeWidget.style.setProperty('display', '', 'important');
          nativeWidget.style.setProperty('visibility', 'visible', 'important');
          nativeWidget.style.setProperty('opacity', '1', 'important');
        }
      };

      // Mostrar imediatamente
      showNativeChatwootButton();

      // Observar mudanças no DOM
      const observer = new MutationObserver(showNativeChatwootButton);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Verificar periodicamente
      const interval = setInterval(showNativeChatwootButton, 500);

      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    }
  }, [chatEnabled, chatType, chatBaseUrl, chatWebsiteToken, chatButtonStyle]);

  // Monitorar o estado do widget do Chatwoot (aberto/fechado) e ajustar posição do botão (apenas para estilo custom)
  useEffect(() => {
    if (chatEnabled && chatType === "chatwoot" && chatBaseUrl && chatWebsiteToken && chatButtonStyle === "custom") {
      const checkWidgetState = () => {
        // Verificar se o widget está aberto
        // O Chatwoot cria um elemento com id 'woot-widget-holder' quando aberto
        const widgetHolder = document.querySelector('#woot-widget-holder') as HTMLElement;
        
        if (!widgetHolder) {
          setChatwootWidgetOpen(false);
          return;
        }
        
        // Verificar múltiplas condições para detectar se está aberto
        const computedStyle = window.getComputedStyle(widgetHolder);
        const hasHeight = widgetHolder.offsetHeight > 100; // Widget geralmente tem mais de 100px quando aberto
        const hasWidth = widgetHolder.offsetWidth > 100;
        const isVisible = computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
        const isNotHidden = !widgetHolder.classList.contains('woot--hide');
        
        // Verificar se há um iframe dentro (indicando que o widget está carregado)
        const hasIframe = widgetHolder.querySelector('iframe') !== null;
        
        // O widget está aberto se todas as condições forem verdadeiras
        const isOpen = hasHeight && hasWidth && isVisible && isNotHidden && hasIframe;
        
        setChatwootWidgetOpen(isOpen);
      };

      // Verificar periodicamente o estado do widget (mais frequente para melhor responsividade)
      const interval = setInterval(checkWidgetState, 200);

      // Observar mudanças no DOM
      const observer = new MutationObserver(checkWidgetState);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // Verificar imediatamente
      checkWidgetState();

      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    }
  }, [chatEnabled, chatType, chatBaseUrl, chatWebsiteToken, chatButtonStyle]);

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
        // DEBUG: Log da ordem original do banco
        console.log("[BookingEngine] Ordem do banco:", engineEstablishments.map((e: any) => ({
          id: e.establishment_id,
          name: e.establishments?.name,
          display_order: e.display_order
        })));
        
        // IMPORTANTE: Manter a ordem EXATA do banco ao mapear os estabelecimentos
        // Não usar map/filter que pode alterar a ordem, usar a ordem original do array
        const establishmentsList: any[] = [];
        for (const e of engineEstablishments) {
          const establishment = e.establishments as any;
          if (establishment && establishment.id) {
            establishmentsList.push({
              ...establishment,
              display_order: e.display_order ?? 999999, // Preservar a ordem de exibição
            });
          }
        }
        
        // DEBUG: Log após mapear
        console.log("[BookingEngine] Após mapear:", establishmentsList.map((e: any) => ({
          id: e.id,
          name: e.name,
          display_order: e.display_order
        })));
        
        // Buscar cidades e fotos dos estabelecimentos
        // Usar for loop para manter a ordem do display_order
        const establishmentsWithCityData: any[] = [];
        for (const est of establishmentsList) {
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
          
          establishmentsWithCityData.push({
            ...est,
            city: hotelSettingsData?.city || null,
            photo: photo,
          });
        }
        
        // Garantir que a ordem do display_order seja mantida
        // establishmentsList já está na ordem correta do display_order do banco
        // establishmentsWithCityData mantém a mesma ordem porque usamos for loop
        // IMPORTANTE: Preservar display_order em ambos os arrays
        const establishmentsWithOrder = establishmentsWithCityData.map((est: any) => ({
          ...est,
          display_order: est.display_order ?? 999999, // Garantir que display_order existe
        }));
        
        const establishmentsListWithOrder = establishmentsList.map((est: any) => ({
          ...est,
          display_order: est.display_order ?? 999999, // Garantir que display_order existe
        }));
        
        // DEBUG: Log antes de definir os estados
        console.log("[BookingEngine] Antes de definir estados:", {
          establishmentsWithOrder: establishmentsWithOrder.map((e: any) => ({
            id: e.id,
            name: e.name,
            display_order: e.display_order
          })),
          establishmentsListWithOrder: establishmentsListWithOrder.map((e: any) => ({
            id: e.id,
            name: e.name,
            display_order: e.display_order
          }))
        });
        
        setEstablishmentsWithCities(establishmentsWithOrder);
        // Manter a ordem original do display_order ao definir companyEstablishments
        setCompanyEstablishments(establishmentsListWithOrder);

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

  // Filtrar estabelecimentos por cidade selecionada, mantendo a ordem do display_order
  const filteredEstablishments = useMemo(() => {
    if (companyEstablishments.length === 0) return [];
    
    // DEBUG: Log dos estabelecimentos antes de filtrar
    console.log("[BookingEngine] filteredEstablishments - companyEstablishments:", companyEstablishments.map((e: any) => ({
      id: e.id,
      name: e.name,
      display_order: e.display_order
    })));
    
    let filtered: any[] = [];
    
    if (selectedCity === "all") {
      // IMPORTANTE: companyEstablishments já vem ordenado do banco por display_order
      // Não ordenar novamente, apenas retornar na ordem original
      filtered = [...companyEstablishments]; // Criar cópia para não mutar o original
    } else {
      // Filtrar por cidade, mas manter a ordem original baseada no display_order
      const filteredIds = new Set(
        establishmentsWithCities
          .filter((est: any) => est.city === selectedCity)
          .map((est: any) => est.id)
      );
      
      // Filtrar mantendo a ordem original do companyEstablishments
      // Usar Set para busca O(1) e manter ordem original
      filtered = companyEstablishments.filter((est: any) => filteredIds.has(est.id));
    }
    
    // IMPORTANTE: Não ordenar novamente se já está na ordem correta
    // Apenas garantir que display_order existe em todos os itens
    const result = filtered.map((est: any) => ({
      ...est,
      display_order: est.display_order ?? 999999,
    }));
    
    // DEBUG: Log do resultado final
    console.log("[BookingEngine] filteredEstablishments - resultado final:", result.map((e: any) => ({
      id: e.id,
      name: e.name,
      display_order: e.display_order
    })));
    
    return result;
  }, [companyEstablishments, establishmentsWithCities, selectedCity]);

  // Resetar índice da página quando os estabelecimentos filtrados mudarem
  useEffect(() => {
    setEstablishmentsPageIndex(0);
  }, [selectedCity, filteredEstablishments.length]);

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

  // AbortController para cancelar requisições anteriores
  const priceCalculationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancelar requisições anteriores
    if (priceCalculationAbortRef.current) {
      priceCalculationAbortRef.current.abort();
    }

    const abortController = new AbortController();
    priceCalculationAbortRef.current = abortController;

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

        if (nightsCount <= 0) {
          setCalculatingPrices(false);
          return;
        }

        // Buscar hotel_settings para cada estabelecimento único
        const establishmentIds = [...new Set(roomCategories.map((cat: any) => cat.establishment_id))];
        const hotelSettingsMap: Record<string, any> = {};
        
        for (const estId of establishmentIds) {
          if (abortController.signal.aborted) break;
          
          const { data: settingsData } = await supabase
            .from("hotel_settings" as any)
            .select("*")
            .eq("establishment_id", estId)
            .maybeSingle();
          if (settingsData) {
            hotelSettingsMap[estId] = settingsData;
          }
        }

        if (abortController.signal.aborted) {
          setCalculatingPrices(false);
          return;
        }

        // Preparar todas as requisições
        const priceRequests: Array<{
          establishmentId: string;
          categoryId: string;
          planId: string;
          date: string;
          adults: number;
          children: number;
          categoryKey: string; // Para agrupar resultados
        }> = [];

        for (const cat of roomCategories) {
          const establishmentId = cat.establishment_id;
          const settings = hotelSettingsMap[establishmentId];
          const plan1Id = settings?.public_pricing_plan_1_id || null;
          
          if (!plan1Id) {
            pricesPlan1[cat.id] = null;
            continue;
          }

          for (let i = 0; i < nightsCount; i++) {
            const currentDate = addDays(startDate, i);
            const dateStr = formatDateLocal(currentDate);

            priceRequests.push({
              establishmentId,
              categoryId: cat.id,
              planId: plan1Id,
              date: dateStr,
              adults: adultsNum,
              children: childrenNum,
              categoryKey: cat.id,
            });
          }
        }

        if (priceRequests.length === 0) {
          setCategoryPricesPlan1(pricesPlan1);
          setCategoryPrices(pricesPlan1);
          setCalculatingPrices(false);
          return;
        }

        // Executar requisições em batch
        const results = await batchCalculateRatePrice(
          priceRequests,
          supabase,
          3, // maxConcurrent: 3 requisições por vez
          abortController.signal
        );

        if (abortController.signal.aborted) {
          setCalculatingPrices(false);
          return;
        }

        // Agrupar resultados por categoria (somar todas as noites)
        const categoryTotals: Record<string, number> = {};

        priceRequests.forEach((req, index) => {
          const result = results[index];
          if (!categoryTotals[req.categoryKey]) {
            categoryTotals[req.categoryKey] = 0;
          }
          categoryTotals[req.categoryKey] += result.price;
        });

        // Calcular preço total por categoria e multiplicar pelo número de quartos necessários
        // (mesma lógica da página pública de reservas: soma todas as noites, depois multiplica por requiredRooms)
        Object.keys(categoryTotals).forEach((categoryId) => {
          const totalPriceForAllNights = categoryTotals[categoryId];
          
          // Encontrar a categoria para calcular quartos necessários
          const category = roomCategories.find((cat: any) => cat.id === categoryId);
          if (category) {
            // Calcular número de quartos necessários baseado na capacidade (mesma lógica da página pública)
            const requiredRooms = calculateRequiredRooms(adultsNum, category);
            
            // Multiplicar preço total (soma de todas as noites) pelo número de quartos necessários
            // (exatamente como na página pública: return categoryTotal * requiredRooms;)
            const finalPrice = totalPriceForAllNights * requiredRooms;
            pricesPlan1[categoryId] = finalPrice > 0 ? finalPrice : null;
          } else {
            pricesPlan1[categoryId] = null;
          }
        });

        setCategoryPricesPlan1(pricesPlan1);
        setCategoryPrices(pricesPlan1);
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Erro ao calcular preços:", error);
        }
      } finally {
        if (!abortController.signal.aborted) {
        setCalculatingPrices(false);
        }
      }
    };

    run();

    return () => {
      abortController.abort();
    };
  }, [roomCategories, checkin, checkout, adults, children]);

  // Função para calcular quartos necessários baseado na capacidade (mesma lógica da página de reserva pública)
  const calculateRequiredRooms = (adults: number, category: any): number => {
    if (!category || !category.capacity_adults || category.capacity_adults <= 0) {
      return 1; // Se não há capacidade definida, assumir 1 quarto
    }
    return Math.ceil(adults / category.capacity_adults);
  };

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
    
    // Se há um plano selecionado, significa que o usuário já escolheu uma categoria específica
    // de um estabelecimento específico, então usar diretamente o estabelecimento da categoria
    let targetEstablishmentId = categoryEstablishmentId;
    
    // Só verificar múltiplos estabelecimentos se NÃO houver plano selecionado
    // (quando há plano selecionado, o estabelecimento já está definido)
    if (!selectedPlanId) {
      // Verificar se há múltiplos estabelecimentos com essa categoria (mesmo nome)
      const categoriesWithSameName = roomCategories.filter(
        (cat: any) => cat.name === selectedCategory.name
      );
      const uniqueEstablishments = [...new Set(categoriesWithSameName.map((cat: any) => cat.establishment_id))];
      
      // Se há múltiplos estabelecimentos com a mesma categoria, verificar se precisa mostrar diálogo
      if (uniqueEstablishments.length > 1) {
        // Se há um estabelecimento selecionado e corresponde à categoria, usar diretamente
        if (selectedEstablishmentId && uniqueEstablishments.includes(selectedEstablishmentId)) {
          targetEstablishmentId = selectedEstablishmentId;
        } else {
          // Se há múltiplos estabelecimentos, mostrar diálogo para escolher
          setPendingCategoryId(targetCategoryId);
          setShowEstablishmentDialog(true);
          return;
        }
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

          {/* Botões de Ação - Disponibilidade e Buscar pelo código */}
          <div className="max-w-6xl mx-auto mb-4 flex flex-wrap gap-3 justify-center">
            <Button
              variant="outline"
              className={`h-12 px-6 rounded-xl font-semibold text-sm flex items-center gap-2 border-2 ${
                themeKey === 'default' ? 'border-blue-600 text-blue-600 hover:bg-blue-50' :
                themeKey === 'modern' ? 'border-amber-500 text-amber-500 hover:bg-amber-500/10' :
                themeKey === 'luxury' ? 'border-amber-400 text-amber-400 hover:bg-amber-400/10' :
                themeKey === 'dark' ? 'border-blue-400 text-blue-400 hover:bg-blue-400/10' :
                themeKey === 'travel' ? 'border-blue-500 text-blue-500 hover:bg-blue-50' :
                'border-blue-600 text-blue-600 hover:bg-blue-50'
              } bg-white/90 backdrop-blur-sm`}
            >
              <CalendarDays className="w-4 h-4" />
              Disponibilidade
            </Button>
            <Button
              onClick={() => setShowSearchReservationDialog(true)}
              className={`h-12 px-6 rounded-xl font-semibold text-sm flex items-center gap-2 ${theme.primaryButton} ${theme.primaryButtonHover} shadow-lg`}
            >
              <Search className="w-4 h-4" />
              Buscar pelo código
            </Button>
          </div>

          {/* Search Card - Centered - Elegant Horizontal Layout */}
          <div className="max-w-6xl mx-auto animate-fade-in-up-delay">
            <Card className={`${theme.searchCard} ${theme.searchCardShadow} ${theme.searchCardBorder} p-6 md:p-8 rounded-3xl transition-all duration-300`}>
              {/* Main Search Bar - Horizontal Layout */}
              <div className="flex flex-col lg:flex-row items-stretch gap-3 lg:gap-0 lg:divide-x lg:divide-slate-200/50">
                {/* Check-in e Check-out */}
                <div className="flex-1 lg:flex-[1.5] lg:pr-4">
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
                    customTrigger={
                      <button
                        type="button"
                        className={`w-full h-16 ${theme.searchInputBg} ${theme.searchInputBorder} border rounded-xl px-4 flex items-center gap-3 ${theme.searchInputText} ${theme.searchInputFocus} transition-all hover:shadow-md`}
                      >
                        <CalendarDays className={`w-5 h-5 flex-shrink-0 ${
                          themeKey === 'default' ? 'text-blue-600' :
                          themeKey === 'modern' ? 'text-amber-500' :
                          themeKey === 'luxury' ? 'text-amber-400' :
                          themeKey === 'dark' ? 'text-blue-400' :
                          themeKey === 'travel' ? 'text-blue-500' :
                          'text-blue-600'
                        }`} />
                        <div className="flex-1 text-left">
                          <div className={`text-xs ${theme.textMuted} mb-0.5`}>Check-in e checkout</div>
                          <div className={`text-sm font-medium ${theme.textPrimary}`}>
                            {checkin && checkout
                              ? `${checkin} - ${checkout}`
                              : checkin
                              ? `${checkin} - Selecionar checkout`
                              : "Selecione as datas"}
                          </div>
                        </div>
                        <ChevronDown className={`w-4 h-4 ${theme.textMuted}`} />
                      </button>
                    }
                  />
                </div>

                {/* Hóspedes (Adultos + Crianças) */}
                <div className="flex-1 lg:px-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={`w-full h-16 ${theme.searchInputBg} ${theme.searchInputBorder} border rounded-xl px-4 flex items-center gap-3 ${theme.searchInputText} ${theme.searchInputFocus} transition-all hover:shadow-md`}
                      >
                        <Users className={`w-5 h-5 flex-shrink-0 ${
                          themeKey === 'default' ? 'text-blue-600' :
                          themeKey === 'modern' ? 'text-amber-500' :
                          themeKey === 'luxury' ? 'text-amber-400' :
                          themeKey === 'dark' ? 'text-blue-400' :
                          themeKey === 'travel' ? 'text-blue-500' :
                          'text-blue-600'
                        }`} />
                        <div className="flex-1 text-left">
                          <div className={`text-xs ${theme.textMuted} mb-0.5`}>Hóspedes</div>
                          <div className={`text-sm font-medium ${theme.textPrimary}`}>
                            {parseInt(adults, 10) || 1} {parseInt(adults, 10) === 1 ? 'adulto' : 'adultos'}
                            {parseInt(children, 10) > 0 && `, ${parseInt(children, 10)} ${parseInt(children, 10) === 1 ? 'criança' : 'crianças'}`}
                          </div>
                        </div>
                        <ChevronDown className={`w-4 h-4 ${theme.textMuted}`} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-4" align="start">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`font-medium ${theme.textPrimary}`}>Adultos</div>
                            <div className={`text-xs ${theme.textMuted}`}>A partir de 18 anos</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const currentAdults = parseInt(adults, 10) || 1;
                                if (currentAdults > 1) {
                                  setAdults((currentAdults - 1).toString());
                                }
                              }}
                              disabled={parseInt(adults, 10) <= 1}
                              className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                                parseInt(adults, 10) <= 1
                                  ? `border-slate-300 text-slate-400 opacity-50 cursor-not-allowed`
                                  : `${theme.searchInputBorder} ${theme.textSecondary} ${theme.primaryButtonHover} hover:text-white`
                              }`}
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className={`w-8 text-center font-semibold ${theme.textPrimary}`}>
                              {parseInt(adults, 10) || 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const currentAdults = parseInt(adults, 10) || 1;
                                if (currentAdults < 30) {
                                  setAdults((currentAdults + 1).toString());
                                }
                              }}
                              disabled={parseInt(adults, 10) >= 30}
                              className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                                parseInt(adults, 10) >= 30
                                  ? `border-slate-300 text-slate-400 opacity-50 cursor-not-allowed`
                                  : `${theme.searchInputBorder} ${theme.textSecondary} ${theme.primaryButtonHover} hover:text-white`
                              }`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`font-medium ${theme.textPrimary}`}>Crianças</div>
                            <div className={`text-xs ${theme.textMuted}`}>Até 17 anos</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const currentChildren = parseInt(children, 10) || 0;
                                if (currentChildren > 0) {
                                  setChildren((currentChildren - 1).toString());
                                }
                              }}
                              disabled={parseInt(children, 10) <= 0}
                              className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                                parseInt(children, 10) <= 0
                                  ? `border-slate-300 text-slate-400 opacity-50 cursor-not-allowed`
                                  : `${theme.searchInputBorder} ${theme.textSecondary} ${theme.primaryButtonHover} hover:text-white`
                              }`}
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className={`w-8 text-center font-semibold ${theme.textPrimary}`}>
                              {parseInt(children, 10) || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const currentChildren = parseInt(children, 10) || 0;
                                if (currentChildren < 10) {
                                  setChildren((currentChildren + 1).toString());
                                }
                              }}
                              disabled={parseInt(children, 10) >= 10}
                              className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                                parseInt(children, 10) >= 10
                                  ? `border-slate-300 text-slate-400 opacity-50 cursor-not-allowed`
                                  : `${theme.searchInputBorder} ${theme.textSecondary} ${theme.primaryButtonHover} hover:text-white`
                              }`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Cidade */}
                {availableCities.length > 0 && (
                  <div className="flex-1 lg:px-4">
                    <Select
                      value={selectedCity}
                      onValueChange={(value) => {
                        setSelectedCity(value);
                        if (value !== "all") {
                          setSelectedEstablishmentId(null);
                          setEstablishment(null);
                          setSelectedRoomId(null);
                          setSelectedPlanId(null);
                        }
                      }}
                    >
                      <SelectTrigger className={`h-16 ${theme.searchInputBg} ${theme.searchInputBorder} border rounded-xl px-4 ${theme.searchInputText} ${theme.searchInputFocus} transition-all hover:shadow-md`}>
                        <div className="flex items-center gap-3 w-full">
                          <SlidersHorizontal className={`w-5 h-5 flex-shrink-0 ${
                            themeKey === 'default' ? 'text-blue-600' :
                            themeKey === 'modern' ? 'text-amber-500' :
                            themeKey === 'luxury' ? 'text-amber-400' :
                            themeKey === 'dark' ? 'text-blue-400' :
                            themeKey === 'travel' ? 'text-blue-500' :
                            'text-blue-600'
                          }`} />
                          <div className="flex-1 text-left">
                            <div className={`text-xs ${theme.textMuted} mb-0.5`}>Cidade</div>
                            <SelectValue className={`text-sm font-medium ${theme.textPrimary}`}>
                              {selectedCity === "all" ? "Todas as cidades" : selectedCity}
                            </SelectValue>
                          </div>
                        </div>
                      </SelectTrigger>
                      <SelectContent className={`${theme.cardBg} ${theme.cardBorder}`}>
                        <SelectItem value="all" className={theme.textPrimary}>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Todas as cidades
                          </div>
                        </SelectItem>
                        {availableCities.map((city: string) => (
                          <SelectItem key={city} value={city} className={theme.textPrimary}>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              {city}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Botão de Busca */}
                <div className="lg:pl-4">
                  <Button
                    className={`h-16 px-8 ${theme.primaryButton} ${theme.primaryButtonHover} rounded-xl font-semibold text-base flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all`}
                    onClick={() => handleSubmit()}
                  >
                    <Search className="w-5 h-5" />
                    <span className="hidden sm:inline">Procurar</span>
                    <span className="sm:hidden">Buscar</span>
                  </Button>
                </div>
              </div>

              {/* Cupom de desconto */}
              <div className="mt-4 pt-4 border-t border-slate-200/50">
                <div className="flex items-center gap-3">
                  <Percent className={`w-4 h-4 ${
                    themeKey === 'default' ? 'text-blue-600' :
                    themeKey === 'modern' ? 'text-amber-500' :
                    themeKey === 'luxury' ? 'text-amber-400' :
                    themeKey === 'dark' ? 'text-blue-400' :
                    themeKey === 'travel' ? 'text-blue-500' :
                    'text-blue-600'
                  }`} />
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
            <div className="relative">
              {/* Container com scroll horizontal ou grid limitado */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative">
                {filteredEstablishments
                  .slice(establishmentsPageIndex, establishmentsPageIndex + 3)
                  .map((est: any) => {
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
              
              {/* Navegação com setas */}
              {filteredEstablishments.length > 3 && (
                <div className="flex items-center justify-center gap-4 mt-6">
                  {/* Botão Anterior */}
                  <button
                    onClick={() => setEstablishmentsPageIndex(Math.max(0, establishmentsPageIndex - 3))}
                    disabled={establishmentsPageIndex === 0}
                    className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 ${
                      establishmentsPageIndex === 0
                        ? `opacity-50 cursor-not-allowed ${theme.cardBg} ${theme.cardBorder}`
                        : `${theme.primaryButton} ${theme.primaryButtonHover} shadow-md hover:shadow-lg`
                    }`}
                    aria-label="Estabelecimentos anteriores"
                  >
                    <ChevronLeft className={`w-5 h-5 ${establishmentsPageIndex === 0 ? theme.textMuted : 'text-white'}`} />
                  </button>
                  
                  {/* Indicador de página */}
                  <div className={`flex items-center gap-2 ${theme.textSecondary} text-sm`}>
                    <span>
                      {Math.floor(establishmentsPageIndex / 3) + 1} de {Math.ceil(filteredEstablishments.length / 3)}
                    </span>
                  </div>
                  
                  {/* Botão Próximo */}
                  <button
                    onClick={() => setEstablishmentsPageIndex(Math.min(filteredEstablishments.length - 3, establishmentsPageIndex + 3))}
                    disabled={establishmentsPageIndex >= filteredEstablishments.length - 3}
                    className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 ${
                      establishmentsPageIndex >= filteredEstablishments.length - 3
                        ? `opacity-50 cursor-not-allowed ${theme.cardBg} ${theme.cardBorder}`
                        : `${theme.primaryButton} ${theme.primaryButtonHover} shadow-md hover:shadow-lg`
                    }`}
                    aria-label="Próximos estabelecimentos"
                  >
                    <ChevronRight className={`w-5 h-5 ${establishmentsPageIndex >= filteredEstablishments.length - 3 ? theme.textMuted : 'text-white'}`} />
                  </button>
                </div>
              )}
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

            {!roomsLoading && filteredEstablishments
              .filter((est: any) => categoriesByEstablishment[est.id]) // Apenas estabelecimentos com categorias
              .map((est: any) => {
                const { establishment, categories } = categoriesByEstablishment[est.id];
                const establishmentId = est.id;
                
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
                    <img src="/whatsapp.png" alt="WhatsApp" className="w-4 h-4 opacity-70 object-contain" />
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
          {(socialInstagram || socialFacebook || socialTwitter || socialYoutube || socialLinkedin || socialWebsite || socialWhatsapp) && (
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
              {socialLinkedin && (
                <a
                  href={socialLinkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="LinkedIn"
                >
                  <Linkedin className="w-4 h-4" />
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
                  <img src="/whatsapp.png" alt="WhatsApp" className="w-4 h-4 object-contain" />
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
              // Usar filteredEstablishments para manter a ordem do display_order
              const filteredEstsForDialog = searchDialogCity === "all"
                ? filteredEstablishments
                : filteredEstablishments.filter((est: any) => {
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

      {/* Dialog de busca de reserva */}
      <Dialog open={showSearchReservationDialog} onOpenChange={setShowSearchReservationDialog}>
        <DialogContent className={`${theme.cardBg} ${theme.cardBorder} max-w-md`}>
          <DialogHeader>
            <DialogTitle className={`${theme.textPrimary} flex items-center gap-2`}>
              <Search className="w-5 h-5" />
              Buscar Reserva
            </DialogTitle>
            <DialogDescription className={theme.textSecondary}>
              Informe o localizador ou identificador da reserva, nome e telefone
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label className={theme.textSecondary}>Localizador/Identificador</Label>
              <Input
                placeholder="Ex: ABC123"
                value={reservationSearchData.locator}
                onChange={(e) =>
                  setReservationSearchData({ ...reservationSearchData, locator: e.target.value.toUpperCase() })
                }
                className={`${theme.searchInputBg} ${theme.searchInputBorder} border ${theme.searchInputText} ${theme.searchInputFocus}`}
              />
            </div>
            <div className="space-y-2">
              <Label className={theme.textSecondary}>Nome do Hóspede</Label>
              <Input
                placeholder="Nome completo"
                value={reservationSearchData.name}
                onChange={(e) =>
                  setReservationSearchData({ ...reservationSearchData, name: e.target.value })
                }
                className={`${theme.searchInputBg} ${theme.searchInputBorder} border ${theme.searchInputText} ${theme.searchInputFocus}`}
              />
            </div>
            <div className="space-y-2">
              <Label className={theme.textSecondary}>Telefone</Label>
              <Input
                placeholder="(00) 00000-0000"
                value={reservationSearchData.phone}
                onChange={(e) =>
                  setReservationSearchData({ ...reservationSearchData, phone: e.target.value })
                }
                className={`${theme.searchInputBg} ${theme.searchInputBorder} border ${theme.searchInputText} ${theme.searchInputFocus}`}
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button
              onClick={() => {
                setShowSearchReservationDialog(false);
                setReservationSearchData({ locator: "", name: "", phone: "" });
              }}
              variant="outline"
              className={`${theme.secondaryButton} ${theme.secondaryButtonHover}`}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!reservationSearchData.locator && !reservationSearchData.name && !reservationSearchData.phone) {
                  alert("Preencha pelo menos um campo para buscar");
                  return;
                }

                setSearchingReservation(true);
                try {
                  // Buscar reserva por localizador, nome e telefone
                  let query = supabase
                    .from("reservations")
                    .select(`
                      *,
                      clients:client_id (
                        id,
                        full_name,
                        email,
                        phone
                      )
                    `);

                  // Aplicar filtros
                  if (reservationSearchData.locator) {
                    query = query.eq("reservation_code", reservationSearchData.locator.toUpperCase());
                  }

                  const { data: reservations, error } = await query;

                  if (error) throw error;

                  // Filtrar por nome e telefone se fornecidos
                  let filteredReservations = reservations || [];
                  
                  if (reservationSearchData.name) {
                    filteredReservations = filteredReservations.filter((r: any) => {
                      const clientName = r.clients?.full_name || r.guest_name || "";
                      return clientName.toLowerCase().includes(reservationSearchData.name.toLowerCase());
                    });
                  }

                  if (reservationSearchData.phone) {
                    const phoneDigits = reservationSearchData.phone.replace(/\D/g, "");
                    filteredReservations = filteredReservations.filter((r: any) => {
                      const clientPhone = r.clients?.phone || "";
                      return clientPhone.replace(/\D/g, "").includes(phoneDigits);
                    });
                  }

                  if (filteredReservations.length === 0) {
                    alert("Nenhuma reserva encontrada com os dados informados");
                    setSearchingReservation(false);
                    return;
                  }

                  if (filteredReservations.length > 1) {
                    alert(`Múltiplas reservas encontradas. Por favor, seja mais específico.`);
                    setSearchingReservation(false);
                    return;
                  }

                  // Navegar para a página de detalhes da reserva
                  const reservation = filteredReservations[0];
                  navigate(`/motor/${companySlug || company?.booking_engine_slug}/reserva/${reservation.id}`);
                  setShowSearchReservationDialog(false);
                  setReservationSearchData({ locator: "", name: "", phone: "" });
                } catch (err: any) {
                  console.error("Erro ao buscar reserva:", err);
                  alert("Erro ao buscar reserva. Tente novamente.");
                } finally {
                  setSearchingReservation(false);
                }
              }}
              disabled={searchingReservation}
              className={`${theme.primaryButton} ${theme.primaryButtonHover}`}
            >
              {searchingReservation ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Buscar
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Botão Flutuante do Chatwoot (apenas quando estilo for "custom") */}
      {chatEnabled && chatType === "chatwoot" && chatBaseUrl && chatWebsiteToken && chatButtonStyle === "custom" && (
        <div 
          className={`fixed right-6 z-[9999] transition-all duration-300 ${
            chatwootWidgetOpen 
              ? 'bottom-[420px]' // Posição abaixo do widget do chat quando aberto (altura aproximada do widget: ~400px)
              : 'bottom-24' // Posição original quando fechado
          }`}
          style={{ pointerEvents: 'auto' }}
        >
          {/* Anel pulsante - apenas quando fechado */}
          {!chatwootWidgetOpen && (
            <>
              <div className="absolute inset-0 rounded-full bg-blue-500 opacity-75 animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"></div>
              <div className="absolute inset-0 rounded-full bg-blue-500 opacity-50 animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite_0.5s]"></div>
            </>
          )}
          <button
            onClick={() => {
              // Abrir o widget do Chatwoot programaticamente
              if (window.chatwootSDK) {
                window.chatwootSDK.run({
                  websiteToken: chatWebsiteToken,
                  baseUrl: chatBaseUrl
                });
                
                // Tentar abrir o widget
                const chatwootWidget = document.querySelector('[data-chatwoot-widget]') as HTMLElement;
                if (chatwootWidget) {
                  chatwootWidget.click();
                } else {
                  // Alternativa: procurar pelo botão do widget do Chatwoot
                  const chatwootButton = document.querySelector('.woot-widget-bubble') as HTMLElement;
                  if (chatwootButton) {
                    chatwootButton.click();
                  }
                }
                
                // Se o SDK tem método toggle, usar
                if ((window.chatwootSDK as any).toggle) {
                  (window.chatwootSDK as any).toggle();
                }
              }
            }}
            className={`relative flex items-center justify-center w-20 h-20 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-110 group ${
              !chatwootWidgetOpen ? 'animate-[pulse-button_2s_ease-in-out_infinite]' : ''
            } cursor-pointer`}
            aria-label="Fale conosco via Chat"
          >
            <MessageCircle className="w-12 h-12 relative z-10" />
            {/* Tooltip */}
            <div className="absolute right-full mr-3 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-20">
              Fale conosco via Chat
              <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-slate-900"></div>
            </div>
          </button>
        </div>
      )}

      {/* Botão Flutuante do WhatsApp */}
      {chatEnabled && chatType === "whatsapp" && whatsappDdi && whatsappNumber && (
        <div className="fixed bottom-24 right-6 z-50">
          {/* Anel pulsante */}
          <div className="absolute inset-0 rounded-full bg-green-500 opacity-75 animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"></div>
          {/* Segundo anel pulsante com delay */}
          <div className="absolute inset-0 rounded-full bg-green-500 opacity-50 animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite_0.5s]"></div>
          <a
            href={`https://wa.me/${whatsappDdi}${whatsappNumber.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex items-center justify-center w-20 h-20 bg-green-500 hover:bg-green-600 rounded-full shadow-2xl hover:shadow-green-500/50 transition-all duration-300 hover:scale-110 group animate-[pulse-button_2s_ease-in-out_infinite]"
            aria-label="Fale conosco no WhatsApp"
          >
            <img 
              src="/whatsapp.png" 
              alt="WhatsApp" 
              className="w-12 h-12 object-contain relative z-10"
            />
            {/* Tooltip */}
            <div className="absolute right-full mr-3 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-20">
              Fale conosco no WhatsApp
              <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-slate-900"></div>
            </div>
          </a>
        </div>
      )}
      </div>
    </>
  );
};

export default BookingEnginePage;
