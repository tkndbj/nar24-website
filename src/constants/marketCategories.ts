import {
    Wine,
    Cookie,
    Coffee,
    Droplets,
    Apple,
    UtensilsCrossed,
    Beef,
    Wheat,
    Egg,
    Croissant,
    IceCream2,
    Dumbbell,
    SprayCan,
    Lamp,
    Sparkles,
    Smartphone,
    Heart,
    Baby,
    Shirt,
    PenTool,
    Dog,
    Wrench,
    type LucideIcon,
  } from "lucide-react";
  
  export interface MarketCategory {
    slug: string;
    label: string;
    labelTr: string;
    icon: LucideIcon;
    color: string; // tailwind color key
  }
  
  export const MARKET_CATEGORIES: MarketCategory[] = [
    {
      slug: "alcohol-cigarette",
      label: "Alcohol & Cigarette",
      labelTr: "Alkol & Sigara",
      icon: Wine,
      color: "rose",
    },
    {
      slug: "snack",
      label: "Snack",
      labelTr: "Atıştırmalık",
      icon: Cookie,
      color: "amber",
    },
    {
      slug: "drinks",
      label: "Drinks",
      labelTr: "İçecekler",
      icon: Coffee,
      color: "orange",
    },
    {
      slug: "water",
      label: "Water",
      labelTr: "Su",
      icon: Droplets,
      color: "sky",
    },
    {
      slug: "fruit-vegetables",
      label: "Fruit & Vegetables",
      labelTr: "Meyve & Sebze",
      icon: Apple,
      color: "green",
    },
    {
      slug: "food",
      label: "Food",
      labelTr: "Gıda",
      icon: UtensilsCrossed,
      color: "red",
    },
    {
      slug: "meat-chicken-fish",
      label: "Meat, Chicken & Fish",
      labelTr: "Et, Tavuk & Balık",
      icon: Beef,
      color: "stone",
    },
    {
      slug: "basic-food",
      label: "Basic Food",
      labelTr: "Temel Gıda",
      icon: Wheat,
      color: "yellow",
    },
    {
      slug: "dairy-breakfast",
      label: "Dairy & Breakfast",
      labelTr: "Süt Ürünleri & Kahvaltılık",
      icon: Egg,
      color: "lime",
    },
    {
      slug: "bakery",
      label: "Bakery",
      labelTr: "Fırın & Unlu Mamüller",
      icon: Croissant,
      color: "amber",
    },
    {
      slug: "ice-cream",
      label: "Ice Cream",
      labelTr: "Dondurma",
      icon: IceCream2,
      color: "pink",
    },
    {
      slug: "fit-form",
      label: "Fit & Form",
      labelTr: "Fit & Form",
      icon: Dumbbell,
      color: "emerald",
    },
    {
      slug: "home-care",
      label: "Home Care",
      labelTr: "Ev Bakım",
      icon: SprayCan,
      color: "blue",
    },
    {
      slug: "home-lite",
      label: "Home Lite",
      labelTr: "Ev Gereçleri",
      icon: Lamp,
      color: "indigo",
    },
    {
      slug: "personal-care",
      label: "Personal Care",
      labelTr: "Kişisel Bakım",
      icon: Sparkles,
      color: "violet",
    },
    {
      slug: "technology",
      label: "Technology",
      labelTr: "Teknoloji",
      icon: Smartphone,
      color: "slate",
    },
    {
      slug: "sexual-health",
      label: "Sexual Health",
      labelTr: "Cinsel Sağlık",
      icon: Heart,
      color: "fuchsia",
    },
    {
      slug: "baby",
      label: "Baby",
      labelTr: "Bebek",
      icon: Baby,
      color: "cyan",
    },
    {
      slug: "clothing",
      label: "Clothing",
      labelTr: "Giyim",
      icon: Shirt,
      color: "purple",
    },
    {
      slug: "stationery",
      label: "Stationery",
      labelTr: "Kırtasiye",
      icon: PenTool,
      color: "teal",
    },
    {
      slug: "pet",
      label: "Pet",
      labelTr: "Evcil Hayvan",
      icon: Dog,
      color: "orange",
    },
    {
      slug: "tools",
      label: "Tools",
      labelTr: "Hırdavat & Alet",
      icon: Wrench,
      color: "zinc",
    },
  ];
  
  /** O(1) lookup by slug */
  export const MARKET_CATEGORY_MAP = new Map(
    MARKET_CATEGORIES.map((c) => [c.slug, c]),
  );
  