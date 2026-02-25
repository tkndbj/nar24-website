"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { useTheme } from "@/hooks/useTheme";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useProduct } from "../../../../context/ProductContext";
import { useTranslations, useLocale } from "next-intl";
import DynamicFlowRenderer from "../../../components/List-Product/DynamicFlowRenderer";
import {
  smartCompress,
  shouldCompress,
  formatFileSize,
  CompressionResult,
} from "../../../utils/imageCompression";

// Types matching Flutter structure exactly
interface NextStep {
  stepId: string;
  conditions?: {
    category?: string[];
    subcategory?: string[];
    subsubcategory?: string[];
  };
}

interface SerializedFile {
  name: string;
  type: string;
  data: string;
}

interface FlowStep {
  id: string;
  stepType: string;
  title: string;
  required: boolean;
  nextSteps: NextStep[];
}

interface ProductListingFlow {
  id: string;
  name: string;
  description: string;
  version: string;
  isActive: boolean;
  isDefault: boolean;
  startStepId: string;
  steps: { [key: string]: FlowStep };
  createdAt?: Date;
  updatedAt?: Date;
  createdBy: string;
  usageCount: number;
  completionRate: number;
}

import type { AllInOneCategoryData as AllInOneCategoryDataType } from "@/constants/productData";

export default function ListProductForm() {
  const t = useTranslations("listProduct");

  // Dynamic import for AllInOneCategoryData
  const [AllInOneCategoryData, setAllInOneCategoryData] = useState<typeof AllInOneCategoryDataType | null>(null);
  useEffect(() => {
    import("@/constants/productData").then((mod) => setAllInOneCategoryData(() => mod.AllInOneCategoryData));
  }, []);
  const tGender = useTranslations("genderStep");
  const tFootwear = useTranslations("footwearSizeStep");
  const tClothing = useTranslations("clothingStep");
  const tComputer = useTranslations("computerComponentsStep");
  const tConsoles = useTranslations("consolesStep");
  const tJewelryMaterial = useTranslations("jewelryMaterialStep");
  const tJewelryType = useTranslations("jewelryTypeStep");
  const tKitchen = useTranslations("kitchenAppliancesStep");
  const tPant = useTranslations("pantDetailsStep");
  const tWhiteGoods = useTranslations("whiteGoodsStep");
  const tColor = useTranslations("colorOptionStep");
  const tRoot = useTranslations();

  const { saveProductForPreview, productData, productFiles, isRestored } =
    useProduct();
  const router = useRouter();
  const locale = useLocale(); // ADD THIS

  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionStats, setCompressionStats] = useState<{
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  }>({ originalSize: 0, compressedSize: 0, compressionRatio: 0 });

  // ADD THIS HELPER FUNCTION
  const buildLocalizedUrl = (path: string): string => {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return locale === "tr" ? `/${cleanPath}` : `/${locale}/${cleanPath}`;
  };
  // Media
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);

  // Basic info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [condition, setCondition] = useState("");
  const [deliveryOption, setDeliveryOption] = useState("");

  // Core product fields (exactly like Flutter)
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [subsubcategory, setSubsubcategory] = useState("");
  const [brand, setBrand] = useState("");
  const [returningFromPreview, setReturningFromPreview] = useState(false);
  // Dynamic attributes map - all specific details go here (like Flutter)
  const [attributes, setAttributes] = useState<{
    [key: string]: string | string[] | number | boolean;
  }>({});

  // Color selection with images (like Flutter's _selectedColorImages)
  const [selectedColorImages, setSelectedColorImages] = useState<{
    [key: string]: { quantity: string; image: File | null };
  }>({});

  // Flow state matching Flutter exactly
  const [flows, setFlows] = useState<ProductListingFlow[]>([]);
  const [currentFlowSteps, setCurrentFlowSteps] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [flowCompleted, setFlowCompleted] = useState(false);
  const [showDynamicStep, setShowDynamicStep] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestartingFlow] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null
  );
  const [isDirty, setIsDirty] = useState(false);
  const isDarkMode = useTheme();

  // Edit mode detection (like Flutter)
  const isEditMode = false; // TODO: Add edit mode support

  // Flow data loading from Firestore (matching Flutter)
  useEffect(() => {
    const flowsQuery = query(
      collection(db, "product_flows"),
      where("isActive", "==", true)
    );

    const unsubscribe = onSnapshot(flowsQuery, (snapshot) => {
      const flowsData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || "",
          description: data.description || "",
          version: data.version || "1.0.0",
          isActive: data.isActive || false,
          isDefault: data.isDefault || false,
          startStepId: data.startStepId || "",
          steps: data.steps || {},
          createdBy: data.createdBy || "",
          usageCount: data.usageCount || 0,
          completionRate: data.completionRate || 0,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
        } as ProductListingFlow;
      });

      setFlows(flowsData);
      console.log(`🔄 ${t("console.loadedFlows")} ${flowsData.length}`);
    });

    return () => unsubscribe();
  }, [t]);

  useEffect(() => {
    const hasData = !!(
      title.trim() ||
      description.trim() ||
      price ||
      quantity !== "1" ||
      condition ||
      deliveryOption ||
      category ||
      subcategory ||
      subsubcategory ||
      brand ||
      images.length > 0 ||
      video ||
      Object.keys(attributes).length > 0 ||
      Object.keys(selectedColorImages).length > 0
    );
    setIsDirty(hasData);
  }, [
    title,
    description,
    price,
    quantity,
    condition,
    deliveryOption,
    category,
    subcategory,
    subsubcategory,
    brand,
    images,
    video,
    attributes,
    selectedColorImages,
  ]);

  useEffect(() => {
    // Handle browser refresh/close
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        const message = t("form.unsavedChanges");
        e.returnValue = message;
        return message;
      }
    };

    if (isDirty) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, t]);

  // Separate useEffect for handling programmatic navigation
  useEffect(() => {
    const originalPush = router.push;

    router.push = (...args: Parameters<typeof originalPush>) => {
      if (isDirty) {
        let url = "/";
        if (typeof args[0] === "string") {
          url = args[0];
        } else if (
          typeof args[0] === "object" &&
          args[0] &&
          "pathname" in args[0]
        ) {
          url = (args[0] as { pathname: string }).pathname;
        }

        setPendingNavigation(url);
        setShowExitModal(true);
        return Promise.resolve(true);
      }
      return originalPush.apply(router, args);
    };

    return () => {
      router.push = originalPush;
    };
  }, [isDirty, router, t]);

  useEffect(() => {
    const shouldReset = sessionStorage.getItem("productFormReset");
    if (shouldReset === "true") {
      sessionStorage.removeItem("productFormReset");
      resetFormState();
      console.log("✅ " + t("console.formReset"));
    }
  }, [t]);

  useEffect(() => {
    if (!isRestored) return;

    if (productData && productFiles) {
      console.log("✅ " + t("console.restoringFromContext"));

      // Restore basic fields
      setTitle(productData.title || "");
      setDescription(productData.description || "");
      setPrice(productData.price || "");
      setQuantity(productData.quantity || "1");
      setCondition(productData.condition || "");
      setDeliveryOption(productData.deliveryOption || "");
      setCategory(productData.category || "");
      setSubcategory(productData.subcategory || "");
      setSubsubcategory(productData.subsubcategory || "");
      setBrand(productData.brand || "");

      setAttributes(productData.attributes || {});

      setImages(productFiles.images || []);
      setVideo(productFiles.video || null);
      setSelectedColorImages(productFiles.selectedColorImages || {});

      // FIX: Don't execute flow, just mark it as completed since all data is already there
      if (
        productData.category &&
        productData.subcategory &&
        productData.subsubcategory
      ) {
        // Check if we have all required data to consider flow completed
        const hasFlowData = !!(
          productData.brand ||
          Object.keys(productData.attributes).length > 0 ||
          Object.keys(productFiles.selectedColorImages || {}).length > 0
        );

        if (hasFlowData) {
          // Mark flow as completed without executing it
          setFlowCompleted(true);
          setShowDynamicStep(false);
          console.log("✅ Flow marked as completed (data already exists)");
        } else {
          // Only execute flow if no flow data exists
          setTimeout(() => {
            executeProductFlow(
              productData.category,
              productData.subcategory,
              productData.subsubcategory
            );
          }, 100);
        }
      }

      return;
    }

    // Fallback: Check sessionStorage
    const savedData = sessionStorage.getItem("productPreviewData");
    if (savedData) {
      try {
        console.log("✅ " + t("console.restoringFromSession"));
        const parsed = JSON.parse(savedData);

        setTitle(parsed.title || "");
        setDescription(parsed.description || "");
        setPrice(parsed.price || "");
        setQuantity(parsed.quantity || "1");
        setCondition(parsed.condition || "");
        setDeliveryOption(parsed.deliveryOption || "");
        setCategory(parsed.category || "");
        setSubcategory(parsed.subcategory || "");
        setSubsubcategory(parsed.subsubcategory || "");
        setBrand(parsed.brand || "");

        setAttributes(parsed.attributes || {});

        if (parsed.selectedColors) {
          const colorFiles: {
            [key: string]: { quantity: string; image: File | null };
          } = {};
          for (const [colorName, colorInfo] of Object.entries(
            parsed.selectedColors
          )) {
            const typedColorInfo = colorInfo as {
              quantity: string;
              imageData: string | null;
            };

            if (typedColorInfo.imageData) {
              const byteCharacters = atob(
                typedColorInfo.imageData.split(",")[1]
              );
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const file = new File([byteArray], `${colorName}.jpg`, {
                type: "image/jpeg",
              });
              colorFiles[colorName] = {
                quantity: typedColorInfo.quantity,
                image: file,
              };
            } else {
              colorFiles[colorName] = {
                quantity: typedColorInfo.quantity,
                image: null,
              };
            }
          }
          setSelectedColorImages(colorFiles);
        }

        if (parsed.images) {
          const imageFiles = parsed.images.map((img: SerializedFile) => {
            const byteCharacters = atob(img.data.split(",")[1]);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            return new File([byteArray], img.name, { type: img.type });
          });
          setImages(imageFiles);
        }

        if (parsed.video) {
          const byteCharacters = atob(parsed.video.data.split(",")[1]);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const videoFile = new File([byteArray], parsed.video.name, {
            type: parsed.video.type,
          });
          setVideo(videoFile);
        }

        if (parsed.category && parsed.subcategory && parsed.subsubcategory) {
          setTimeout(() => {
            executeProductFlow(
              parsed.category,
              parsed.subcategory,
              parsed.subsubcategory
            );
          }, 100);
        }
      } catch (error) {
        console.error(t("console.restoreError"), error);
      }
    }
  }, [isRestored, productData, productFiles, t]);

  useEffect(() => {
    const isReturning = sessionStorage.getItem("returningFromPreview");
    if (isReturning === "true") {
      sessionStorage.removeItem("returningFromPreview");
      setReturningFromPreview(true);

      // Ensure flow is marked as completed when returning
      if (productData && productFiles) {
        setFlowCompleted(true);
        setShowDynamicStep(false);
      }

      // Auto-reset the flag after a short delay to ensure subsequent actions work
      setTimeout(() => {
        setReturningFromPreview(false);
      }, 500);
    }
  }, []);

  const getLocalizedAttributeValue = (
    key: string,
    value: string | string[] | number | boolean
  ): string => {
    if (Array.isArray(value)) {
      return value.map((v) => getLocalizedAttributeValue(key, v)).join(", ");
    }

    // Use the appropriate translation function based on the key
    switch (key) {
      case "footwearSizes":
        return tFootwear(`sizes.${value}`, { fallback: String(value) });
      case "gender":
        return tGender(String(value).toLowerCase(), {
          fallback: String(value),
        });
      case "clothingSize":
      case "clothingSizes":
        return tClothing(`sizes.${value}`, { fallback: String(value) });
      case "clothingFit":
        return tClothing(`fits.${value}`, { fallback: String(value) });
      case "clothingType":
        return tClothing(`types.${value}`, { fallback: String(value) });
      case "computerComponent":
        return tComputer(`components.${value}`, { fallback: String(value) });
      case "consoleBrand":
        return tConsoles(`brands.${value}`, { fallback: String(value) });
      case "consoleVariant":
        return tConsoles(`variants.${value}`, { fallback: String(value) });
      case "jewelryMaterial":
        return tJewelryMaterial(`materials.${value}`, {
          fallback: String(value),
        });
      case "jewelryType":
        return tJewelryType(`types.${value}`, { fallback: String(value) });
      case "kitchenAppliance":
        return tKitchen(`appliances.${value}`, { fallback: String(value) });
      case "pantSizes":
        return tPant(`sizes.${value}`, { fallback: String(value) });
      case "whiteGood":
        return tWhiteGoods(`whiteGoods.${value}`, { fallback: String(value) });
      default:
        // For colors or unknown types
        if (typeof value === "string" && value.length > 0) {
          const colorTranslation = tColor(`colors.${value}`);
          if (colorTranslation !== `colors.${value}`) {
            return colorTranslation;
          }
        }
        return String(value);
    }
  };

  const getAttributeLabel = (key: string): string => {
    // Use the appropriate translation function for labels
    switch (key) {
      case "footwearSizes":
        return tFootwear("title");
      case "gender":
        return tGender("title");
      case "clothingSize":
        return tClothing("clothingSize");
      case "clothingSizes":
        return tClothing("clothingSize");
      case "clothingFit":
        return tClothing("clothingFit");
      case "clothingType":
        return tClothing("clothingType");
      case "computerComponent":
        return tComputer("title");
      case "consoleBrand":
        return tConsoles("selectConsoleBrand");
      case "consoleVariant":
        return tConsoles("selectConsoleVariant");
      case "jewelryMaterial":
        return tJewelryMaterial("title");
      case "jewelryType":
        return tJewelryType("title");
      case "kitchenAppliance":
        return tKitchen("title");
      case "pantSizes":
        return tPant("title");
      case "whiteGood":
        return tWhiteGoods("title");
      default:
        return key; // fallback to the key itself
    }
  };

  // Matching Flutter's flow matching logic exactly
  const findMatchingFlow = (
    cat: string,
    sub: string,
    subsub: string
  ): ProductListingFlow | null => {
    console.log("🔍 Looking for MOST SPECIFIC flow matching:", {
      cat,
      sub,
      subsub,
    });

    const matchingFlows: { flow: ProductListingFlow; specificity: number }[] =
      [];

    for (const flow of flows) {
      if (!flow.isActive) {
        console.log(`❌ Skipping inactive flow: ${flow.name}`);
        continue;
      }

      console.log(`🔍 Checking flow: ${flow.name}`);

      // Check all steps for matching conditions
      for (const step of Object.values(flow.steps)) {
        for (const nextStep of step.nextSteps) {
          const conditions = nextStep.conditions;
          if (!conditions) continue;

          console.log(
            `    📋 Checking conditions for ${flow.name}:`,
            conditions
          );

          // Check category match
          const categoryList = conditions.category;
          const categoryMatch = categoryList && categoryList.includes(cat);

          if (!categoryMatch) {
            console.log(`    ❌ Category mismatch for ${flow.name}`);
            continue;
          }

          // Check subcategory match
          const subcategoryList = conditions.subcategory;
          let subcategoryMatch = true;
          if (subcategoryList && subcategoryList.length > 0) {
            subcategoryMatch = subcategoryList.includes(sub);
            if (!subcategoryMatch) {
              console.log(`    ❌ Subcategory mismatch for ${flow.name}`);
              continue;
            }
          }

          // Check subsubcategory match
          const subSubcategoryList = conditions.subsubcategory;
          let subSubcategoryMatch = true;
          if (subSubcategoryList && subSubcategoryList.length > 0) {
            subSubcategoryMatch = subSubcategoryList.includes(subsub);
            if (!subSubcategoryMatch) {
              console.log(`    ❌ Subsubcategory mismatch for ${flow.name}`);
              continue;
            }
          }

          // Calculate specificity score
          // Higher score = more specific flow
          let specificity = 0;

          if (categoryList && categoryList.length > 0) specificity += 1;
          if (subcategoryList && subcategoryList.length > 0) specificity += 10;
          if (subSubcategoryList && subSubcategoryList.length > 0)
            specificity += 100;

          console.log(
            `✅ Flow "${flow.name}" matches with specificity: ${specificity}`
          );

          matchingFlows.push({ flow, specificity });
          break; // Found a match for this flow, no need to check other steps
        }
      }
    }

    if (matchingFlows.length === 0) {
      console.log("❌ No matching flows found");
      return null;
    }

    // Sort by specificity (highest first) and take the most specific
    matchingFlows.sort((a, b) => b.specificity - a.specificity);

    const selectedFlow = matchingFlows[0];

    console.log("🎯 Flow selection results:");
    matchingFlows.forEach((item, index) => {
      console.log(
        `  ${index === 0 ? "✅ SELECTED" : "  "} ${
          item.flow.name
        } (specificity: ${item.specificity})`
      );
    });

    console.log(`🏆 Most specific flow selected: ${selectedFlow.flow.name}`);
    return selectedFlow.flow;
  };

  const getLocalizedCategoryName = (categoryKey: string): string => {
    // Convert "Clothing & Fashion" to "categoryClothingFashion"
    const key = `category${categoryKey.replace(/[^a-zA-Z0-9]/g, "")}`;
    const localized = tRoot(key);
    return localized !== key ? localized : categoryKey;
  };

  const getLocalizedSubcategoryName = (subcategoryKey: string): string => {
    // Convert "Tops & Shirts" to "subcategoryTopsShirts"
    const key = `subcategory${subcategoryKey.replace(/[^a-zA-Z0-9]/g, "")}`;
    const localized = tRoot(key);
    return localized !== key ? localized : subcategoryKey;
  };

  const getLocalizedSubSubcategoryName = (
    subSubcategoryKey: string
  ): string => {
    // Convert "Casual Dresses" to "subSubcategoryCasualDresses"
    const key = `subSubcategory${subSubcategoryKey.replace(
      /[^a-zA-Z0-9]/g,
      ""
    )}`;
    const localized = tRoot(key);
    return localized !== key ? localized : subSubcategoryKey;
  };

  const restartFlow = async () => {
    console.log("🔄 " + t("console.restartingFlow"));

    // IMPORTANT: Always clear the returningFromPreview flag when manually restarting
    setReturningFromPreview(false);

    // Clear current flow state but keep the category selections
    setCurrentFlowSteps([]);
    setCurrentStepIndex(0);
    setFlowCompleted(false);
    setShowDynamicStep(false);

    // Clear dynamic attributes and selections (but keep basic product info)
    setBrand("");
    setAttributes({});
    setSelectedColorImages({});

    // Force a small delay to ensure state updates are processed
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Restart the flow with current category selections
    if (category && subcategory && subsubcategory) {
      executeProductFlow(category, subcategory, subsubcategory);
    }
  };

  const resetFormState = () => {
    setImages([]);
    setVideo(null);
    setTitle("");
    setDescription("");
    setPrice("");
    setQuantity("1");
    setCondition("");
    setDeliveryOption("");
    setCategory("");
    setSubcategory("");
    setSubsubcategory("");
    setBrand("");
    setAttributes({});
    setSelectedColorImages({});
    setCurrentFlowSteps([]);
    setCurrentStepIndex(0);
    setFlowCompleted(false);
    setShowDynamicStep(false);
    setIsDirty(false);

    sessionStorage.removeItem("productPreviewData");
  };

  const handleExitConfirm = () => {
    setIsDirty(false);
    resetFormState();
    setShowExitModal(false);

    if (pendingNavigation) {
      setTimeout(() => {
        window.location.href = pendingNavigation;
      }, 0);
      setPendingNavigation(null);
    }
  };

  const handleExitCancel = () => {
    setShowExitModal(false);
    setPendingNavigation(null);
  };

  // Robust linearization matching Flutter's version
  const linearizeFlow = (flow: ProductListingFlow): string[] => {
    const out: string[] = [];
    let cur = flow.startStepId;
    const visited = new Set<string>();

    console.log("🔄 " + t("console.linearizingFlow") + ":", flow.name);
    console.log("🔄 " + t("console.startStep") + ":", cur);
    console.log(
      "🔄 " + t("console.availableSteps") + ":",
      Object.keys(flow.steps)
    );

    while (cur && !visited.has(cur)) {
      visited.add(cur);

      if (cur === "preview") {
        console.log("🔄 " + t("console.reachedPreview"));
        break;
      }

      out.push(cur);
      console.log("🔄 " + t("console.addedStep") + ":", cur);

      const step = flow.steps[cur];
      if (!step) {
        console.log("❌ " + t("console.stepNotFound") + ":", cur);
        break;
      }

      if (step.nextSteps.length === 0) {
        console.log("🔄 " + t("console.noNextSteps"));
        break;
      }

      const nextId = step.nextSteps[0].stepId;
      if (nextId === "preview") {
        console.log("🔄 " + t("console.nextIsPreview"));
        break;
      }

      cur = nextId;
      console.log("🔄 " + t("console.nextStep") + ":", cur);
    }

    console.log("🔄 " + t("console.finalLinearizedFlow") + ":", out);
    return out;
  };

  // Execute product flow when category changes (like Flutter)
  const executeProductFlow = async (
    cat: string,
    sub: string,
    subsub: string
  ) => {
    // Skip only if returning from preview AND not being called from restartFlow
    if (returningFromPreview && productData && !showDynamicStep) {
      console.log("🔄 Skipping flow execution - returning from preview");
      setFlowCompleted(true);
      setShowDynamicStep(false);
      return;
    }

    console.log(
      "🚀 " + t("console.executingFlow") + ":",
      cat,
      ">",
      sub,
      ">",
      subsub
    );

    const flow = findMatchingFlow(cat, sub, subsub);
    if (!flow) {
      setCurrentFlowSteps([]);
      setCurrentStepIndex(0);
      setFlowCompleted(false);
      setShowDynamicStep(false);
      return;
    }

    const stepIds = linearizeFlow(flow);
    console.log("📋 " + t("console.flowSteps") + ":", stepIds);
    setCurrentFlowSteps(stepIds);
    setCurrentStepIndex(0);
    setFlowCompleted(false);

    // Start the flow if there are steps
    if (stepIds.length > 0) {
      window.scrollTo(0, 0);
      setShowDynamicStep(true);
    } else {
      setFlowCompleted(true);
    }
  };

  const handleStepBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
      window.scrollTo(0, 0); // Scroll to top when going back
      console.log(
        `⬅️ Going back to step ${currentStepIndex - 1}: ${
          currentFlowSteps[currentStepIndex - 1]
        }`
      );
    } else {
      // If at first step, exit the flow
      handleStepCancel();
    }
  };

  // Handle category selection (like Flutter's _showCategoryPicker)
  const handleCategoryChange = async (
    newCat: string,
    newSub: string,
    newSubSub: string
  ) => {
    const changed =
      newCat !== category ||
      newSub !== subcategory ||
      newSubSub !== subsubcategory;
    if (changed) {
      setBrand("");
      setSelectedColorImages({});
      setAttributes({});
      console.log("🧹 " + t("console.clearedPreviousSelections"));
    }

    setCategory(newCat);
    setSubcategory(newSub);
    setSubsubcategory(newSubSub);

    if (newCat && newSub && newSubSub) {
      await executeProductFlow(newCat, newSub, newSubSub);
    }
  };

  // Handle step completion from dynamic components
  const handleStepComplete = (
    result:
      | { [key: string]: unknown }
      | { [key: string]: { [key: string]: unknown } }
      | null
  ) => {
    if (result === null) {
      // Handle null result (e.g., from color step when user selects "no colors")
      console.log("🔄 Step completed with null result (no data)");
    } else if (result && typeof result === "object") {
      console.log("🔄 Step result:", result);

      // Check if this is color data by examining the structure
      const isColorData = Object.values(result).every(
        (value) =>
          value &&
          typeof value === "object" &&
          "image" in value &&
          "quantity" in value
      );

      if (isColorData) {
        // This is color data from color step
        console.log("🎨 Color result detected:", result);
        const colorResult = result as {
          [key: string]: { image: File | null; quantity: number };
        };
        const newColorImages: {
          [key: string]: { quantity: string; image: File | null };
        } = {};

        Object.entries(colorResult).forEach(([color, data]) => {
          newColorImages[color] = {
            quantity: data.quantity.toString(),
            image: data.image,
          };
        });

        setSelectedColorImages(newColorImages);
      } else {
        // Handle other step results
        const genericResult = result as { [key: string]: unknown };

        if (genericResult.brand && typeof genericResult.brand === "string") {
          setBrand(genericResult.brand);
        }

        // Everything else goes to attributes
        const newAttributes: {
          [key: string]: string | string[] | number | boolean;
        } = { ...attributes };
        Object.entries(genericResult).forEach(([key, value]) => {
          if (key !== "brand" && value !== null && value !== undefined) {
            if (
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean" ||
              Array.isArray(value)
            ) {
              newAttributes[key] = value as
                | string
                | string[]
                | number
                | boolean;
            }
          }
        });
        setAttributes(newAttributes);
      }
    }

    // Move to next step
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= currentFlowSteps.length) {
      setFlowCompleted(true);
      setShowDynamicStep(false);
      console.log("✅ Flow completed");
    } else {
      setCurrentStepIndex(nextIndex);
      console.log(
        `➡️ Moving to step ${nextIndex}: ${currentFlowSteps[nextIndex]}`
      );
    }
  };

  // Handle step cancellation
  const handleStepCancel = () => {
    setShowDynamicStep(false);
    setCurrentFlowSteps([]);
    setCurrentStepIndex(0);
    setFlowCompleted(false);
  };

  // Get current step
  const getCurrentStep = (): string | null => {
    if (currentStepIndex < currentFlowSteps.length) {
      return currentFlowSteps[currentStepIndex];
    }
    return null;
  };

  // Media handlers
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsCompressing(true);

    try {
      const compressionResults: CompressionResult[] = [];
      const compressedFiles: File[] = [];

      // Process each file
      for (const file of files) {
        if (shouldCompress(file, 300)) {
          // Compress if larger than 300KB
          console.log(
            `🔄 Compressing ${file.name} (${formatFileSize(file.size)})`
          );

          const result = await smartCompress(file, "gallery");
          compressionResults.push(result);
          compressedFiles.push(result.compressedFile);

          console.log(
            `✅ Compressed ${file.name}: ${formatFileSize(
              result.originalSize
            )} → ${formatFileSize(
              result.compressedSize
            )} (${result.compressionRatio.toFixed(1)}% reduction)`
          );
        } else {
          // File is already small enough
          compressedFiles.push(file);
          console.log(
            `⏩ Skipping compression for ${file.name} (already optimized)`
          );
        }
      }

      // Update compression stats
      if (compressionResults.length > 0) {
        const totalOriginal = compressionResults.reduce(
          (sum, r) => sum + r.originalSize,
          0
        );
        const totalCompressed = compressionResults.reduce(
          (sum, r) => sum + r.compressedSize,
          0
        );
        const avgRatio =
          ((totalOriginal - totalCompressed) / totalOriginal) * 100;

        setCompressionStats({
          originalSize: totalOriginal,
          compressedSize: totalCompressed,
          compressionRatio: avgRatio,
        });
      }

      // Add compressed images to state
      setImages((prev) => [...prev, ...compressedFiles]);
    } catch (error) {
      console.error("❌ Image compression failed:", error);
      alert(
        t("errors.compressionFailed", {
          fallback: "Image compression failed. Please try again.",
        })
      );
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    const videoFiles = files.filter((file) => file.type.startsWith("video/"));

    // Handle video files (no compression needed)
    if (videoFiles.length > 0 && !video) {
      setVideo(videoFiles[0]);
    }

    // Handle image files with compression
    if (imageFiles.length > 0) {
      setIsCompressing(true);

      try {
        const compressedFiles: File[] = [];

        for (const file of imageFiles) {
          if (shouldCompress(file, 300)) {
            const result = await smartCompress(file, "gallery");
            compressedFiles.push(result.compressedFile);
          } else {
            compressedFiles.push(file);
          }
        }

        setImages((prev) => [...prev, ...compressedFiles]);
      } catch (error) {
        console.error("❌ Drag & drop compression failed:", error);
        alert(
          t("errors.compressionFailed", {
            fallback: "Image compression failed. Please try again.",
          })
        );
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVideo(e.target.files?.[0] || null);
  };

  const removeVideo = () => setVideo(null);

  // Handle final submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDirty(false);

    // Validation (like Flutter's _navigateToPreview validation)
    if (
      !title.trim() ||
      !description.trim() ||
      !price ||
      parseFloat(price) <= 0 ||
      !quantity ||
      parseInt(quantity) <= 0 ||
      !condition ||
      !deliveryOption ||
      !category ||
      !subcategory ||
      !subsubcategory ||
      images.length === 0
    ) {
      alert(t("validation.fillAllFields"));
      return;
    }

    // Check color images (like Flutter validation)
    for (const color of Object.keys(selectedColorImages)) {
      if (!selectedColorImages[color].image) {
        alert(t("validation.addImageForColor", { color }));
        return;
      }
    }

    setIsLoading(true);
    try {
      // Get seller info (similar to Flutter logic)
      let sellerInfo: {
        phone?: string;
        region?: string;
        address?: string;
        ibanOwnerName?: string;
        ibanOwnerSurname?: string;
        iban?: string;
      } | null = null;

      const user = auth.currentUser;
      if (user) {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        sellerInfo = userSnap.exists() ? userSnap.data()?.sellerInfo : null;
      }

      if (!sellerInfo) {
        const user = auth.currentUser;
        if (user) {
          const userSnap = await getDoc(doc(db, "users", user.uid));
          sellerInfo = userSnap.exists() ? userSnap.data()?.sellerInfo : null;
        }
      }

      // Extract gender if it exists (like Flutter)
      let genderValue;
      const cleanedAttributes = { ...attributes };
      if (cleanedAttributes.gender) {
        genderValue = cleanedAttributes.gender as string;
        delete cleanedAttributes.gender;
      }

      const productData = {
        title: title.trim(),
        description: description.trim(),
        price,
        quantity,
        condition,
        deliveryOption,
        category,
        subcategory,
        subsubcategory,
        brand,
        attributes: cleanedAttributes,
        gender: genderValue,
        phone: sellerInfo?.phone ?? "",
        region: sellerInfo?.region ?? "",
        address: sellerInfo?.address ?? "",
        ibanOwnerName: sellerInfo?.ibanOwnerName ?? "",
        ibanOwnerSurname: sellerInfo?.ibanOwnerSurname ?? "",
        iban: sellerInfo?.iban ?? "",
        shopId: null,
      };

      const productFiles = {
        images,
        video,
        selectedColorImages,
      };

      await saveProductForPreview(productData, productFiles);
      router.push(buildLocalizedUrl("/listproductpreview"));
    } catch (error) {
      console.error(t("console.dataPreparationError"), error);
      alert(t("errors.dataPreparationFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // Get the current step to render
  const currentStep = getCurrentStep();

  // Show dynamic step component if active
  if (showDynamicStep && currentStep) {
    return (
      <DynamicFlowRenderer
        stepId={currentStep}
        category={category}
        subcategory={subcategory}
        subsubcategory={subsubcategory}
        initialBrand={brand}
        initialAttributes={attributes}
        selectedColorImages={selectedColorImages}
        onStepComplete={handleStepComplete}
        onCancel={handleStepCancel}
        onBack={currentStepIndex > 0 ? handleStepBack : undefined}
      />
    );
  }

  const UploadIcon = () => (
    <svg
      className="w-12 h-12 text-slate-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );

  const VideoIcon = () => (
    <svg
      className="w-8 h-8 text-slate-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );

  const headingColor = isDarkMode ? "text-white" : "text-gray-900";
  const labelColor = isDarkMode ? "text-gray-200" : "text-gray-700";
  const mutedColor = isDarkMode ? "text-gray-500" : "text-gray-400";
  const cardClass = isDarkMode
    ? "bg-gray-900 rounded-2xl border border-gray-800 p-4 sm:p-5"
    : "bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm";
  const inputClass = isDarkMode
    ? "w-full px-3 py-2.5 text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
    : "w-full px-3 py-2.5 text-sm bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 outline-none transition-all";
  const selectClass = isDarkMode
    ? "w-full px-3 py-2.5 text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
    : "w-full px-3 py-2.5 text-sm bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 outline-none transition-all";

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gray-950" : "bg-gray-50/50"}`}>
      {/* Sticky Toolbar */}
      <div className={`sticky top-14 z-30 backdrop-blur-xl border-b ${isDarkMode ? "bg-gray-950/80 border-gray-800/80" : "bg-white/80 border-gray-100/80"}`}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 px-3 sm:px-6 py-2">
            <button
              onClick={() => router.back()}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${isDarkMode ? "bg-gray-800 border-gray-700 hover:bg-gray-700" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}
            >
              <ArrowLeft className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`} />
            </button>
            <h1 className={`text-lg font-bold truncate ${headingColor}`}>
              {t("pageTitle")}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Media Upload Section */}
          <div className={cardClass}>
            <h2 className={`text-sm font-bold mb-3 ${headingColor}`}>
              {t("sections.mediaGallery")}
            </h2>

            {/* Drag & Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 ${
                dragActive
                  ? "border-orange-500 bg-orange-500/10"
                  : isDarkMode
                  ? "border-gray-700 hover:border-orange-500/50 hover:bg-gray-800/50"
                  : "border-gray-200 hover:border-orange-300 hover:bg-orange-50/30"
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragActive(false);
              }}
            >
              {/* Compression Loading Overlay */}
              {isCompressing && (
                <div className={`absolute inset-0 backdrop-blur-sm flex items-center justify-center rounded-xl z-20 ${isDarkMode ? "bg-gray-900/90" : "bg-white/90"}`}>
                  <div className="text-center">
                    <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
                    <p className={`text-sm font-semibold ${headingColor}`}>
                      {t("media.compressing", { fallback: "Compressing images..." })}
                    </p>
                  </div>
                </div>
              )}

              <UploadIcon />
              <h3 className={`text-sm font-semibold mt-2 ${labelColor}`}>
                {t("media.dragDropTitle")}
              </h3>
              <p className={`text-xs mt-1 ${mutedColor}`}>
                {t("media.dragDropSubtitle")}
              </p>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageChange}
                disabled={isCompressing}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />
            </div>

            {/* Compression Stats Display */}
            {compressionStats.compressionRatio > 0 && (
              <div className={`mt-3 p-3 rounded-xl border text-xs ${isDarkMode ? "bg-green-950/30 border-green-900/50 text-green-400" : "bg-green-50 border-green-200 text-green-700"}`}>
                <span className="font-semibold">
                  {t("media.spaceSaved", { fallback: "Space saved" })}:{" "}
                  {compressionStats.compressionRatio.toFixed(1)}% ({formatFileSize(compressionStats.originalSize - compressionStats.compressedSize)})
                </span>
              </div>
            )}

            {/* Image Preview Grid */}
            {images.length > 0 && (
              <div className="mt-4">
                <h4 className={`text-xs font-semibold mb-2 ${labelColor}`}>
                  {t("media.uploadedImages")} ({images.length})
                </h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {images.map((file, idx) => (
                    <div key={idx} className="group relative aspect-square">
                      <Image
                        src={URL.createObjectURL(file)}
                        alt={t("media.preview")}
                        width={200}
                        height={200}
                        className="w-full h-full object-cover rounded-xl"
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md flex items-center justify-center z-20 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Video Upload */}
            <div className={`mt-4 pt-4 border-t ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
              <h4 className={`text-xs font-semibold mb-2 ${labelColor}`}>
                {t("media.video")}
              </h4>

              {!video ? (
                <div className={`border-2 border-dashed rounded-xl p-4 text-center relative ${isDarkMode ? "border-gray-700 hover:border-orange-500/50" : "border-gray-200 hover:border-orange-300"}`}>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <VideoIcon />
                  <p className={`text-xs mt-1 ${mutedColor}`}>
                    {t("media.uploadVideo")}
                  </p>
                </div>
              ) : (
                <div className="relative inline-block">
                  <video
                    src={URL.createObjectURL(video)}
                    controls
                    className="w-48 h-auto rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={removeVideo}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md flex items-center justify-center z-20 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Basic Information */}
          <div className={cardClass}>
            <h2 className={`text-sm font-bold mb-3 ${headingColor}`}>
              {t("sections.productDetails")}
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="lg:col-span-2">
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("form.productTitle")}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                  placeholder={t("form.productTitlePlaceholder")}
                />
              </div>

              <div className="lg:col-span-2">
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("form.description")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder={t("form.descriptionPlaceholder")}
                />
              </div>

              <div>
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("form.price")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={inputClass}
                  placeholder={t("form.pricePlaceholder")}
                />
              </div>

              <div>
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("form.quantity")}
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="lg:col-span-2">
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("form.condition.title")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "Brand New", label: t("form.condition.brandNew") },
                    { key: "Used", label: t("form.condition.used") },
                    { key: "Refurbished", label: t("form.condition.refurbished") },
                  ].map((opt) => (
                    <label key={opt.key} className="cursor-pointer">
                      <input
                        type="radio"
                        name="condition"
                        value={opt.key}
                        checked={condition === opt.key}
                        onChange={() => setCondition(opt.key)}
                        className="sr-only"
                      />
                      <div
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          condition === opt.key
                            ? "border-orange-500 bg-orange-500/10 text-orange-600"
                            : isDarkMode
                            ? "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600"
                            : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {opt.label}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2">
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("form.delivery.title")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "Fast Delivery", label: t("form.delivery.fastDelivery") },
                    { key: "Self Delivery", label: t("form.delivery.selfDelivery") },
                  ].map((opt) => (
                    <label key={opt.key} className="cursor-pointer">
                      <input
                        type="radio"
                        name="deliveryOption"
                        value={opt.key}
                        checked={deliveryOption === opt.key}
                        onChange={() => setDeliveryOption(opt.key)}
                        className="sr-only"
                      />
                      <div
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          deliveryOption === opt.key
                            ? "border-orange-500 bg-orange-500/10 text-orange-600"
                            : isDarkMode
                            ? "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600"
                            : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        {opt.label}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Category Selection */}
          <div className={cardClass}>
            <h2 className={`text-sm font-bold mb-3 ${headingColor}`}>
              {t("sections.categoryClassification")}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("form.category")}
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    const newCategory = e.target.value;
                    setCategory(newCategory);
                    setSubcategory("");
                    setSubsubcategory("");
                    setCurrentFlowSteps([]);
                    setCurrentStepIndex(0);
                    setFlowCompleted(false);
                    setShowDynamicStep(false);
                  }}
                  className={selectClass}
                >
                  <option value="">{t("form.selectCategory")}</option>
                  {(AllInOneCategoryData?.kCategories ?? []).map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {getLocalizedCategoryName(cat.key)}
                    </option>
                  ))}
                </select>
              </div>

              {category && (
                <div className="animate-fadeIn">
                  <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                    {t("form.subcategory")}
                  </label>
                  <select
                    value={subcategory}
                    onChange={(e) => {
                      const newSubcategory = e.target.value;
                      setSubcategory(newSubcategory);
                      setSubsubcategory("");
                      setCurrentFlowSteps([]);
                      setCurrentStepIndex(0);
                      setFlowCompleted(false);
                      setShowDynamicStep(false);
                    }}
                    className={selectClass}
                  >
                    <option value="">{t("form.selectSubcategory")}</option>
                    {(AllInOneCategoryData?.kSubcategories[category] ?? []).map(
                      (sub) => (
                        <option key={sub} value={sub}>
                          {getLocalizedSubcategoryName(sub)}
                        </option>
                      )
                    )}
                  </select>
                </div>
              )}

              {subcategory && (
                <div className="animate-fadeIn">
                  <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                    {t("form.subsubcategory")}
                  </label>
                  <select
                    value={subsubcategory}
                    onChange={(e) => {
                      const newSubsubcategory = e.target.value;
                      handleCategoryChange(
                        category,
                        subcategory,
                        newSubsubcategory
                      );
                    }}
                    className={selectClass}
                  >
                    <option value="">{t("form.selectSubsubcategory")}</option>
                    {(
                      AllInOneCategoryData?.kSubSubcategories[category]?.[
                        subcategory
                      ] ?? []
                    ).map((ss) => (
                      <option key={ss} value={ss}>
                        {getLocalizedSubSubcategoryName(ss)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Show completed attributes */}
          {(brand ||
            Object.keys(attributes).length > 0 ||
            Object.keys(selectedColorImages).length > 0) && (
            <div className={cardClass}>
              <div className="flex justify-between items-center mb-3">
                <h3 className={`text-sm font-bold ${headingColor}`}>
                  {t("attributes.title")}
                </h3>
                <button
                  type="button"
                  onClick={restartFlow}
                  disabled={isRestartingFlow}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                >
                  {isRestartingFlow
                    ? t("buttons.updating")
                    : t("buttons.changeDetails")}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {brand && (
                  <div className="flex justify-between">
                    <span className={`font-medium text-xs ${labelColor}`}>
                      {t("attributes.brand", { fallback: "Brand" })}:
                    </span>
                    <span className={`text-xs ${mutedColor}`}>{brand}</span>
                  </div>
                )}

                {Object.entries(attributes).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className={`font-medium text-xs capitalize ${labelColor}`}>
                      {getAttributeLabel(key)}:
                    </span>
                    <span className={`text-xs ${mutedColor}`}>
                      {getLocalizedAttributeValue(key, value)}
                    </span>
                  </div>
                ))}

                {Object.keys(selectedColorImages).length > 0 && (
                  <div className="flex justify-between md:col-span-2">
                    <span className={`font-medium text-xs ${labelColor}`}>
                      {t("attributes.colors", { fallback: "Colors" })}:
                    </span>
                    <span className={`text-xs ${mutedColor}`}>
                      {Object.keys(selectedColorImages)
                        .map((color) =>
                          tColor(`colors.${color}`, { fallback: color })
                        )
                        .join(", ")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          {flowCompleted && (
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 text-white font-semibold text-sm rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading
                  ? t("buttons.processing")
                  : isEditMode
                  ? t("buttons.editProduct")
                  : t("buttons.continueToPreview")}
              </button>
            </div>
          )}
        </form>

        {/* Exit Modal */}
        {showExitModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className={`rounded-2xl max-w-sm w-full shadow-2xl ${isDarkMode ? "bg-gray-900" : "bg-white"}`}>
              <div className={`p-4 border-b ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
                <h3 className={`text-base font-bold ${headingColor}`}>
                  {t("modal.exitTitle")}
                </h3>
              </div>
              <div className="p-4">
                <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>{t("modal.exitMessage")}</p>
              </div>
              <div className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
                <button
                  onClick={handleExitCancel}
                  className={`flex-1 px-4 py-2.5 rounded-xl transition-colors font-medium text-sm ${isDarkMode ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  {t("modal.cancel")}
                </button>
                <button
                  onClick={handleExitConfirm}
                  className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium text-sm"
                >
                  {t("modal.confirmExit")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
