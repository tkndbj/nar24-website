"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { auth, db } from "@/lib/firebase";
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

import { AllInOneCategoryData } from "@/constants/productData";

export default function ListProductForm() {
  const t = useTranslations("listProduct");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* ADD THIS HEADER SECTION */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center h-16">
            <button
              onClick={() => router.back()}
              className="group flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-md transition-all duration-200"
            >
              <svg
                className="w-5 h-5 text-slate-600 group-hover:text-slate-800 transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              <span className="text-sm font-medium text-slate-600 group-hover:text-slate-800 transition-colors"></span>
            </button>
            <h1 className="ml-4 text-xl font-semibold text-slate-800">
              {t("pageTitle")}
            </h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-8 pb-12">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-8">
          {/* Media Upload Section */}
          <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8 hover:shadow-2xl transition-all duration-500">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">📸</span>
              </div>
              {t("sections.mediaGallery")}
            </h2>

            {/* Drag & Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${
                dragActive
                  ? "border-blue-500 bg-blue-50/50 scale-[1.02]"
                  : "border-slate-300 hover:border-blue-400 hover:bg-slate-50/50"
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
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center rounded-2xl z-20">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4">
                      <svg
                        className="w-full h-full animate-spin text-blue-500"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </div>
                    <p className="text-lg font-semibold text-slate-700">
                      {t("media.compressing", {
                        fallback: "Compressing images...",
                      })}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {t("media.compressionNote", {
                        fallback:
                          "Optimizing for storage while maintaining quality",
                      })}
                    </p>
                  </div>
                </div>
              )}

              <UploadIcon />
              <h3 className="text-lg font-semibold text-slate-700 mt-4">
                {t("media.dragDropTitle")}
              </h3>
              <p className="text-slate-500 mt-2">
                {t("media.dragDropSubtitle")}
              </p>
              <p className="text-xs text-slate-400 mt-2">
                {t("media.autoCompressionNote", {
                  fallback: "Images will be automatically optimized",
                })}
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
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-center gap-2 text-green-800">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="font-semibold">
                    {t("media.compressionSuccess", {
                      fallback: "Images optimized successfully!",
                    })}
                  </span>
                </div>
                <div className="mt-2 text-sm text-green-700">
                  <div className="flex justify-between">
                    <span>
                      {t("media.originalSize", { fallback: "Original size" })}:
                    </span>
                    <span className="font-medium">
                      {formatFileSize(compressionStats.originalSize)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      {t("media.compressedSize", {
                        fallback: "Optimized size",
                      })}
                      :
                    </span>
                    <span className="font-medium">
                      {formatFileSize(compressionStats.compressedSize)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-green-200 mt-2 pt-2">
                    <span className="font-semibold">
                      {t("media.spaceSaved", { fallback: "Space saved" })}:
                    </span>
                    <span className="font-bold text-green-600">
                      {compressionStats.compressionRatio.toFixed(1)}% (
                      {formatFileSize(
                        compressionStats.originalSize -
                          compressionStats.compressedSize
                      )}
                      )
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Image Preview Grid */}
            {images.length > 0 && (
              <div className="mt-8">
                <h4 className="text-lg font-semibold text-slate-700 mb-4">
                  {t("media.uploadedImages")} ({images.length})
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {images.map((file, idx) => (
                    <div key={idx} className="group relative aspect-square">
                      <Image
                        src={URL.createObjectURL(file)}
                        alt={t("media.preview")}
                        width={200}
                        height={200}
                        className="w-full h-full object-cover rounded-xl shadow-md group-hover:shadow-lg transition-all duration-300"
                        unoptimized
                      />

                      {/* File Size Indicator */}
                      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {formatFileSize(file.size)}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-all duration-200 flex items-center justify-center z-20"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Video Upload */}
            <div className="mt-8 pt-8 border-t border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <VideoIcon />
                <h4 className="text-lg font-semibold text-slate-700">
                  {t("media.video")}
                </h4>
              </div>

              {!video ? (
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-slate-50/50 transition-all duration-300 relative">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <VideoIcon />
                  <p className="text-slate-600 mt-2">
                    {t("media.uploadVideo")}
                  </p>
                </div>
              ) : (
                <div className="relative inline-block">
                  <video
                    src={URL.createObjectURL(video)}
                    controls
                    className="w-64 h-auto rounded-xl shadow-lg"
                  />
                  <button
                    type="button"
                    onClick={removeVideo}
                    className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-all duration-200 flex items-center justify-center z-20"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Basic Information */}
          <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8 hover:shadow-2xl transition-all duration-500">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">📝</span>
              </div>
              {t("sections.productDetails")}
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  {t("form.productTitle")}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                  placeholder={t("form.productTitlePlaceholder")}
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  {t("form.description")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm resize-none"
                  placeholder={t("form.descriptionPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  {t("form.price")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                  placeholder={t("form.pricePlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  {t("form.quantity")}
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  {t("form.condition.title")}
                </label>
                <div className="flex flex-wrap gap-4">
                  {[
                    { key: "Brand New", label: t("form.condition.brandNew") },
                    { key: "Used", label: t("form.condition.used") },
                    {
                      key: "Refurbished",
                      label: t("form.condition.refurbished"),
                    },
                  ].map((opt) => (
                    <label key={opt.key} className="group cursor-pointer">
                      <input
                        type="radio"
                        name="condition"
                        value={opt.key}
                        checked={condition === opt.key}
                        onChange={() => setCondition(opt.key)}
                        className="sr-only"
                      />
                      <div
                        className={`px-6 py-3 rounded-xl border-2 transition-all duration-200 ${
                          condition === opt.key
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-white/50 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
                        }`}
                      >
                        {opt.label}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  {t("form.delivery.title")}
                </label>
                <div className="flex flex-wrap gap-4">
                  {[
                    {
                      key: "Fast Delivery",
                      label: t("form.delivery.fastDelivery"),
                    },
                    {
                      key: "Self Delivery",
                      label: t("form.delivery.selfDelivery"),
                    },
                  ].map((opt) => (
                    <label key={opt.key} className="group cursor-pointer">
                      <input
                        type="radio"
                        name="deliveryOption"
                        value={opt.key}
                        checked={deliveryOption === opt.key}
                        onChange={() => setDeliveryOption(opt.key)}
                        className="sr-only"
                      />
                      <div
                        className={`px-6 py-3 rounded-xl border-2 transition-all duration-200 ${
                          deliveryOption === opt.key
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-300 bg-white/50 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
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
          <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8 hover:shadow-2xl transition-all duration-500">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">🏷️</span>
              </div>
              {t("sections.categoryClassification")}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
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
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                >
                  <option value="">{t("form.selectCategory")}</option>
                  {AllInOneCategoryData.kCategories.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {getLocalizedCategoryName(cat.key)}
                    </option>
                  ))}
                </select>
              </div>

              {category && (
                <div className="animate-fadeIn">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
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
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                  >
                    <option value="">{t("form.selectSubcategory")}</option>
                    {(AllInOneCategoryData.kSubcategories[category] || []).map(
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
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
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
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
                  >
                    <option value="">{t("form.selectSubsubcategory")}</option>
                    {(
                      AllInOneCategoryData.kSubSubcategories[category]?.[
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
            <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-800">
                  {t("attributes.title")}
                </h3>

                {/* Change Details Button */}
                <button
                  type="button"
                  onClick={restartFlow}
                  disabled={isRestartingFlow}
                  className="group relative px-6 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-amber-400 disabled:to-orange-400 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transform hover:scale-[1.02] transition-all duration-200 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <span className="relative flex items-center gap-2">
                    {isRestartingFlow ? (
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4 transform group-hover:rotate-45 transition-transform duration-200"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    )}
                    {isRestartingFlow
                      ? t("buttons.updating")
                      : t("buttons.changeDetails")}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {brand && (
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-700">
                      {t("attributes.brand", { fallback: "Brand" })}:
                    </span>
                    <span className="text-slate-600">{brand}</span>
                  </div>
                )}

                {Object.entries(attributes).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="font-medium text-slate-700 capitalize">
                      {getAttributeLabel(key)}:
                    </span>
                    <span className="text-slate-600">
                      {getLocalizedAttributeValue(key, value)}
                    </span>
                  </div>
                ))}

                {Object.keys(selectedColorImages).length > 0 && (
                  <div className="flex justify-between md:col-span-2">
                    <span className="font-medium text-slate-700">
                      {t("attributes.colors", { fallback: "Colors" })}:
                    </span>
                    <span className="text-slate-600">
                      {Object.keys(selectedColorImages)
                        .map((color) =>
                          tColor(`colors.${color}`, { fallback: color })
                        )
                        .join(", ")}
                    </span>
                  </div>
                )}
              </div>

              {/* Enhanced info section */}
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-500 text-center">
                  {t("attributes.changeDetailsHint", {
                    fallback:
                      "Click 'Change Details' to update your product specifications",
                  })}
                </p>
              </div>
            </div>
          )}

          {/* Submit Button - Only show when flow is completed */}
          {flowCompleted && (
            <div className="text-center pt-8">
              <button
                type="submit"
                disabled={isLoading}
                className="group relative px-12 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:from-blue-700 hover:via-purple-700 hover:to-indigo-700 text-white font-bold text-lg rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-[1.02] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="relative flex items-center gap-3">
                  {isLoading
                    ? t("buttons.processing")
                    : isEditMode
                    ? t("buttons.editProduct")
                    : t("buttons.continueToPreview")}
                  {!isLoading && (
                    <svg
                      className="w-5 h-5 transform group-hover:translate-x-1 transition-transform duration-200"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          )}
        </form>

        {/* Exit Modal */}
        {showExitModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-3xl p-8 max-w-md mx-4 text-center shadow-2xl">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-amber-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                {t("modal.exitTitle")}
              </h3>
              <p className="text-slate-600 mb-6">{t("modal.exitMessage")}</p>
              <div className="flex gap-3">
                <button
                  onClick={handleExitCancel}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors font-medium"
                >
                  {t("modal.cancel")}
                </button>
                <button
                  onClick={handleExitConfirm}
                  className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium"
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
