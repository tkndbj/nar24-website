// File: src/constants/AttributeLocalization.ts

import { useTranslations } from 'next-intl';

// Type for next-intl translation function
type TranslationFunction = ReturnType<typeof useTranslations>;

export class AttributeLocalizationUtils {
  
  /**
   * Formats all attributes with localized titles and values
   */
  static formatAttributesDisplay(attributes: Record<string, unknown>, t: TranslationFunction): string {
    if (!attributes || Object.keys(attributes).length === 0) return '';

    const displayParts: string[] = [];

    Object.entries(attributes).forEach(([key, value]) => {
      if (value == null) return;

      const displayValue = this.getLocalizedAttributeValue(key, value, t);
      if (displayValue.trim() !== '') {
        const title = this.getLocalizedAttributeTitle(key, t);
        displayParts.push(`${title}: ${displayValue}`);
      }
    });

    return displayParts.join('\n');
  }

  /**
   * Gets localized title for an attribute key
   */
  static getLocalizedAttributeTitle(attributeKey: string, t: TranslationFunction): string {
    switch (attributeKey) {
      // Gender
      case 'gender':
        return t('gender') || 'Gender';
      
      // Clothing attributes
      case 'clothingSizes':
        return t('clothingSize') || 'Clothing Size';
      case 'clothingFit':
        return t('clothingFit') || 'Clothing Fit';
      case 'clothingType':
        return t('fabricType') || 'Fabric Type';
      case 'clothingTypes':  // ✅ ADD: New array key
        return t('fabricType') || 'Fabric Type';
      
      // Footwear attributes
      case 'footwearSizes':
        return t('selectSize') || 'Size';
      
      // Pant attributes
      case 'pantSizes':
        return t('selectAvailableSizes') || 'Pant Sizes';
      case 'pantFabricType':  // ✅ ADD: Legacy key
        return t('fabricType') || 'Fabric Type';
      case 'pantFabricTypes':  // ✅ ADD: New array key
        return t('fabricType') || 'Fabric Type';
      
      // Jewelry attributes
      case 'jewelryType':
        return t('selectJewelryType') || 'Jewelry Type';
      case 'jewelryMaterials':
        return t('selectJewelryMaterial') || 'Jewelry Materials';
      
      // Computer component attributes
      case 'computerComponent':
        return t('selectComputerComponent') || 'Computer Component';
      
      // Console attributes
      case 'consoleBrand':
        return t('selectConsoleBrand') || 'Console Brand';
      case 'consoleVariant':
        return t('selectConsoleVariant') || 'Console Variant';
      
      // Kitchen appliance attributes
      case 'kitchenAppliance':
        return t('selectKitchenAppliance') || 'Kitchen Appliance';
      
      // White goods attributes
      case 'whiteGood':
        return t('selectWhiteGood') || 'White Good';
      
      default:
        // Convert camelCase to Title Case as fallback
        return attributeKey
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .split(' ')
          .map(word => word.length > 0 
            ? word[0].toUpperCase() + word.substring(1).toLowerCase()
            : word)
          .join(' ');
    }
  }

  /**
   * Gets localized value(s) for an attribute
   */
  static getLocalizedAttributeValue(attributeKey: string, value: unknown, t: TranslationFunction): string {
    if (Array.isArray(value)) {
      const localizedItems = value.map(item => 
        this.getLocalizedSingleValue(attributeKey, item, t)
      );
      return localizedItems.join(', ');
    } else {
      return this.getLocalizedSingleValue(attributeKey, value, t);
    }
  }

  /**
   * Localizes a single value based on attribute type
   */
  static getLocalizedSingleValue(attributeKey: string, value: unknown, t: TranslationFunction): string {
    const stringValue = value?.toString() || '';
    
    switch (attributeKey) {
      case 'gender':
        return this.localizeGender(stringValue, t);
      
      case 'clothingSizes':
        return this.localizeClothingSize(stringValue, t);
      
      case 'clothingFit':
        return this.localizeClothingFit(stringValue, t);
      
      case 'clothingType':
      case 'clothingTypes':  // ✅ ADD: Handle new array key
        return this.localizeClothingType(stringValue, t);
      
      case 'pantFabricType':   // ✅ ADD: Handle legacy key
      case 'pantFabricTypes':  // ✅ ADD: Handle new array key
        return this.localizePantFabricType(stringValue, t);
      
      case 'jewelryType':
        return this.localizeJewelryType(stringValue, t);
      
      case 'jewelryMaterials':
        return this.localizeJewelryMaterial(stringValue, t);
      
      case 'computerComponent':
        return this.localizeComputerComponent(stringValue, t);
      
      case 'consoleBrand':
        return this.localizeConsoleBrand(stringValue, t);
      
      case 'consoleVariant':
        return this.localizeConsoleVariant(stringValue, t);
      
      case 'kitchenAppliance':
        return this.localizeKitchenAppliance(stringValue, t);
      
      case 'whiteGood':
        return this.localizeWhiteGood(stringValue, t);
      
      default:
        return stringValue;
    }
  }

  // Individual localization methods for each attribute type

  static localizeGender(gender: string, t: TranslationFunction): string {
    switch (gender) {
      case 'Women':
        return t('clothingGenderWomen') || 'Women';
      case 'Men':
        return t('clothingGenderMen') || 'Men';
      case 'Unisex':
        return t('clothingGenderUnisex') || 'Unisex';
      default:
        return gender;
    }
  }

  static localizeClothingSize(size: string, t: TranslationFunction): string {
    switch (size.toUpperCase()) {
      case 'XXS':
        return t('clothingSizeXXS') || 'XXS';
      case 'XS':
        return t('clothingSizeXS') || 'XS';
      case 'S':
        return t('clothingSizeS') || 'S';
      case 'M':
        return t('clothingSizeM') || 'M';
      case 'L':
        return t('clothingSizeL') || 'L';
      case 'XL':
        return t('clothingSizeXL') || 'XL';
      case 'XXL':
        return t('clothingSizeXXL') || 'XXL';
      case '3XL':
        return t('clothingSize3XL') || '3XL';
      case '4XL':
        return t('clothingSize4XL') || '4XL';
      default:
        return size;
    }
  }

  static localizeClothingFit(fit: string, t: TranslationFunction): string {
    switch (fit) {
      case 'Slim':
        return t('clothingFitSlim') || 'Slim';
      case 'Regular':
        return t('clothingFitRegular') || 'Regular';
      case 'Loose':
        return t('clothingFitLoose') || 'Loose';
      case 'Oversized':
        return t('clothingFitOversized') || 'Oversized';
      default:
        return fit;
    }
  }

  static localizeClothingType(type: string, t: TranslationFunction): string {
    switch (type) {
      case 'Cotton':
        return t('clothingTypeCotton') || 'Cotton';
      case 'Polyester':
        return t('clothingTypePolyester') || 'Polyester';
      case 'Nylon':
        return t('clothingTypeNylon') || 'Nylon';
      case 'Wool':
        return t('clothingTypeWool') || 'Wool';
      case 'Silk':
        return t('clothingTypeSilk') || 'Silk';
      case 'Linen':
        return t('clothingTypeLinen') || 'Linen';
      case 'Denim':
        return t('clothingTypeDenim') || 'Denim';
      case 'Leather':
        return t('clothingTypeLeather') || 'Leather';
      case 'Chino':
        return t('clothingTypeChino') || 'Chino';
      case 'Corduroy':
        return t('clothingTypeCorduroy') || 'Corduroy';
      case 'Velvet':
        return t('clothingTypeVelvet') || 'Velvet';
      case 'Fleece':
        return t('clothingTypeFleece') || 'Fleece';
      case 'Spandex':
        return t('clothingTypeSpandex') || 'Spandex';
      case 'Tweed':
        return t('clothingTypeTweed') || 'Tweed';
      case 'Viscose':
        return t('clothingTypeViscose') || 'Viscose';
      case 'Modal':
        return t('clothingTypeModal') || 'Modal';
      case 'Lyocell':
        return t('clothingTypeLyocell') || 'Lyocell';
        case 'Lycra':
          return t('clothingTypeLycra') || 'Lycra';
          case 'Cashmere':
            return t('clothingTypeCashmere') || 'Cashmere';
            case 'Chiffon':
              return t('clothingTypeChiffon') || 'Şifon';
      case 'Organic Cotton':
        return t('clothingTypeOrganicCotton') || 'Organic Cotton';
      case 'Recycled Cotton':
        return t('clothingTypeRecycledCotton') || 'Recycled Cotton';
      case 'Canvas':
        return t('clothingTypeCanvas') || 'Canvas';
      case 'Jersey':
        return t('clothingTypeJersey') || 'Jersey';
      case 'Gabardine':
        return t('clothingTypeGabardine') || 'Gabardine';
      case 'Satin':
        return t('clothingTypeSatin') || 'Satin';
      case 'Rayon':
        return t('clothingTypeRayon') || 'Rayon';
      case 'Elastane':
        return t('clothingTypeElastane') || 'Elastane';
      case 'Bamboo':
        return t('clothingTypeBamboo') || 'Bamboo';     
      default:
        return type;
    }
  }

  // ✅ ADD: New method for pant fabric types
  static localizePantFabricType(type: string, t: TranslationFunction): string {
    switch (type) {
      case 'Denim':
        return t('pantFabricTypeDenim') || 'Denim';
      case 'Cotton':
        return t('pantFabricTypeCotton') || 'Cotton';
      case 'Chino':
        return t('pantFabricTypeChino') || 'Chino';
      case 'Corduroy':
        return t('pantFabricTypeCorduroy') || 'Corduroy';
      case 'Linen':
        return t('pantFabricTypeLinen') || 'Linen';
      case 'Wool':
        return t('pantFabricTypeWool') || 'Wool';
      case 'Polyester':
        return t('pantFabricTypePolyester') || 'Polyester';
      case 'Leather':
        return t('pantFabricTypeLeather') || 'Leather';
      case 'Velvet':
        return t('pantFabricTypeVelvet') || 'Velvet';
      case 'Fleece':
        return t('pantFabricTypeFleece') || 'Fleece';
      case 'Nylon':
        return t('pantFabricTypeNylon') || 'Nylon';
      case 'Spandex':
        return t('pantFabricTypeSpandex') || 'Spandex';
      case 'Tweed':
        return t('pantFabricTypeTweed') || 'Tweed';
      case 'Silk':
        return t('pantFabricTypeSilk') || 'Silk';
      case 'Viscose':
        return t('pantFabricTypeViscose') || 'Viscose';
      case 'Modal':
        return t('pantFabricTypeModal') || 'Modal';
      case 'Lyocell':
        return t('pantFabricTypeLyocell') || 'Lyocell';
      case 'Organic Cotton':
        return t('pantFabricTypeOrganicCotton') || 'Organic Cotton';
      case 'Recycled Cotton':
        return t('pantFabricTypeRecycledCotton') || 'Recycled Cotton';
      // ✅ Additional options to consider
      case 'Canvas':
        return t('pantFabricTypeCanvas') || 'Canvas';
      case 'Jersey':
        return t('pantFabricTypeJersey') || 'Jersey';
      case 'Gabardine':
        return t('pantFabricTypeGabardine') || 'Gabardine';
      case 'Satin':
        return t('pantFabricTypeSatin') || 'Satin';
      case 'Rayon':
        return t('pantFabricTypeRayon') || 'Rayon';
      case 'Elastane':
        return t('pantFabricTypeElastane') || 'Elastane';     
      case 'Bamboo':
        return t('pantFabricTypeBamboo') || 'Bamboo';
      case 'Lycra':
        return t('pantFabricTypeLycra') || 'Lycra';
      case 'Cashmere':
        return t('pantFabricTypeCashmere') || 'Cashmere';
      case 'Chiffon':
        return t('pantFabricTypeChiffon') || 'Chiffon';
      default:
        return type;
    }
  }

  static localizeJewelryType(type: string, t: TranslationFunction): string {
    switch (type) {
      case 'Necklace':
        return t('jewelryTypeNecklace') || 'Necklace';
      case 'Earring':
        return t('jewelryTypeEarring') || 'Earring';
      case 'Piercing':
        return t('jewelryTypePiercing') || 'Piercing';
      case 'Ring':
        return t('jewelryTypeRing') || 'Ring';
      case 'Bracelet':
        return t('jewelryTypeBracelet') || 'Bracelet';
      case 'Anklet':
        return t('jewelryTypeAnklet') || 'Anklet';
      case 'NoseRing':
        return t('jewelryTypeNoseRing') || 'Nose Ring';
      case 'Set':
        return t('jewelryTypeSet') || 'Set';
      default:
        return type;
    }
  }

  static localizeJewelryMaterial(material: string, t: TranslationFunction): string {
    switch (material) {
      case 'Iron':
        return t('jewelryMaterialIron') || 'Iron';
      case 'Steel':
        return t('jewelryMaterialSteel') || 'Steel';
      case 'Gold':
        return t('jewelryMaterialGold') || 'Gold';
      case 'Silver':
        return t('jewelryMaterialSilver') || 'Silver';
      case 'Diamond':
        return t('jewelryMaterialDiamond') || 'Diamond';
      case 'Copper':
        return t('jewelryMaterialCopper') || 'Copper';
      default:
        return material;
    }
  }

  static localizeComputerComponent(component: string, t: TranslationFunction): string {
    switch (component) {
      case 'CPU':
        return t('computerComponentCPU') || 'CPU';
      case 'GPU':
        return t('computerComponentGPU') || 'GPU';
      case 'RAM':
        return t('computerComponentRAM') || 'RAM';
      case 'Motherboard':
        return t('computerComponentMotherboard') || 'Motherboard';
      case 'SSD':
        return t('computerComponentSSD') || 'SSD';
      case 'HDD':
        return t('computerComponentHDD') || 'HDD';
      case 'PowerSupply':
        return t('computerComponentPowerSupply') || 'Power Supply';
      case 'CoolingSystem':
        return t('computerComponentCoolingSystem') || 'Cooling System';
      case 'Case':
        return t('computerComponentCase') || 'Case';
      case 'OpticalDrive':
        return t('computerComponentOpticalDrive') || 'Optical Drive';
      case 'NetworkCard':
        return t('computerComponentNetworkCard') || 'Network Card';
      case 'SoundCard':
        return t('computerComponentSoundCard') || 'Sound Card';
      case 'Webcam':
        return t('computerComponentWebcam') || 'Webcam';
      case 'Headset':
        return t('computerComponentHeadset') || 'Headset';
      default:
        return component;
    }
  }

  static localizeConsoleBrand(brand: string, t: TranslationFunction): string {
    switch (brand) {
      case 'PlayStation':
        return t('consoleBrandPlayStation') || 'PlayStation';
      case 'Xbox':
        return t('consoleBrandXbox') || 'Xbox';
      case 'Nintendo':
        return t('consoleBrandNintendo') || 'Nintendo';
      case 'PC':
        return t('consoleBrandPC') || 'PC';
      case 'Mobile':
        return t('consoleBrandMobile') || 'Mobile';
      case 'Retro':
        return t('consoleBrandRetro') || 'Retro';
      default:
        return brand;
    }
  }

  static localizeConsoleVariant(variant: string, t: TranslationFunction): string {
    switch (variant) {
      // PlayStation variants
      case 'PS5':
        return t('consoleVariantPS5') || 'PS5';
      case 'PS5_Digital':
        return t('consoleVariantPS5Digital') || 'PS5 Digital';
      case 'PS5_Slim':
        return t('consoleVariantPS5Slim') || 'PS5 Slim';
      case 'PS5_Pro':
        return t('consoleVariantPS5Pro') || 'PS5 Pro';
      case 'PS4':
        return t('consoleVariantPS4') || 'PS4';
      case 'PS4_Slim':
        return t('consoleVariantPS4Slim') || 'PS4 Slim';
      case 'PS4_Pro':
        return t('consoleVariantPS4Pro') || 'PS4 Pro';
      case 'PS3':
        return t('consoleVariantPS3') || 'PS3';
      case 'PS2':
        return t('consoleVariantPS2') || 'PS2';
      case 'PS1':
        return t('consoleVariantPS1') || 'PS1';
      case 'PSP':
        return t('consoleVariantPSP') || 'PSP';
      case 'PS_Vita':
        return t('consoleVariantPSVita') || 'PS Vita';
      
      // Xbox variants
      case 'Xbox_Series_X':
        return t('consoleVariantXboxSeriesX') || 'Xbox Series X';
      case 'Xbox_Series_S':
        return t('consoleVariantXboxSeriesS') || 'Xbox Series S';
      case 'Xbox_One_X':
        return t('consoleVariantXboxOneX') || 'Xbox One X';
      case 'Xbox_One_S':
        return t('consoleVariantXboxOneS') || 'Xbox One S';
      case 'Xbox_One':
        return t('consoleVariantXboxOne') || 'Xbox One';
      case 'Xbox_360':
        return t('consoleVariantXbox360') || 'Xbox 360';
      case 'Xbox_Original':
        return t('consoleVariantXboxOriginal') || 'Xbox Original';
      
      // Nintendo variants
      case 'Switch_OLED':
        return t('consoleVariantSwitchOLED') || 'Switch OLED';
      case 'Switch_Standard':
        return t('consoleVariantSwitchStandard') || 'Switch Standard';
      case 'Switch_Lite':
        return t('consoleVariantSwitchLite') || 'Switch Lite';
      case 'Wii_U':
        return t('consoleVariantWiiU') || 'Wii U';
      case 'Wii':
        return t('consoleVariantWii') || 'Wii';
      case 'GameCube':
        return t('consoleVariantGameCube') || 'GameCube';
      case 'N64':
        return t('consoleVariantN64') || 'N64';
      case 'SNES':
        return t('consoleVariantSNES') || 'SNES';
      case 'NES':
        return t('consoleVariantNES') || 'NES';
      case '3DS_XL':
        return t('consoleVariant3DSXL') || '3DS XL';
      case '3DS':
        return t('consoleVariant3DS') || '3DS';
      case '2DS':
        return t('consoleVariant2DS') || '2DS';
      case 'DS_Lite':
        return t('consoleVariantDSLite') || 'DS Lite';
      case 'DS':
        return t('consoleVariantDS') || 'DS';
      case 'Game_Boy_Advance':
        return t('consoleVariantGameBoyAdvance') || 'Game Boy Advance';
      case 'Game_Boy_Color':
        return t('consoleVariantGameBoyColor') || 'Game Boy Color';
      case 'Game_Boy':
        return t('consoleVariantGameBoy') || 'Game Boy';
      
      // PC variants
      case 'Steam_Deck':
        return t('consoleVariantSteamDeck') || 'Steam Deck';
      case 'Gaming_PC':
        return t('consoleVariantGamingPC') || 'Gaming PC';
      case 'Gaming_Laptop':
        return t('consoleVariantGamingLaptop') || 'Gaming Laptop';
      case 'Mini_PC':
        return t('consoleVariantMiniPC') || 'Mini PC';
      
      // Mobile variants
      case 'iOS':
        return t('consoleVariantiOS') || 'iOS';
      case 'Android':
        return t('consoleVariantAndroid') || 'Android';
      
      // Retro variants
      case 'Atari_2600':
        return t('consoleVariantAtari2600') || 'Atari 2600';
      case 'Sega_Genesis':
        return t('consoleVariantSegaGenesis') || 'Sega Genesis';
      case 'Sega_Dreamcast':
        return t('consoleVariantSegaDreamcast') || 'Sega Dreamcast';
      case 'Neo_Geo':
        return t('consoleVariantNeoGeo') || 'Neo Geo';
      case 'Arcade_Cabinet':
        return t('consoleVariantArcadeCabinet') || 'Arcade Cabinet';
      
      default:
        return variant;
    }
  }

  static localizeKitchenAppliance(appliance: string, t: TranslationFunction): string {
    switch (appliance) {
      case 'Microwave':
        return t('kitchenApplianceMicrowave') || 'Microwave';
      case 'CoffeeMachine':
        return t('kitchenApplianceCoffeeMachine') || 'Coffee Machine';
      case 'Blender':
        return t('kitchenApplianceBlender') || 'Blender';
      case 'FoodProcessor':
        return t('kitchenApplianceFoodProcessor') || 'Food Processor';
      case 'Mixer':
        return t('kitchenApplianceMixer') || 'Mixer';
      case 'Toaster':
        return t('kitchenApplianceToaster') || 'Toaster';
      case 'Kettle':
        return t('kitchenApplianceKettle') || 'Kettle';
      case 'RiceCooker':
        return t('kitchenApplianceRiceCooker') || 'Rice Cooker';
      case 'SlowCooker':
        return t('kitchenApplianceSlowCooker') || 'Slow Cooker';
      case 'PressureCooker':
        return t('kitchenAppliancePressureCooker') || 'Pressure Cooker';
      case 'AirFryer':
        return t('kitchenApplianceAirFryer') || 'Air Fryer';
      case 'Juicer':
        return t('kitchenApplianceJuicer') || 'Juicer';
      case 'Grinder':
        return t('kitchenApplianceGrinder') || 'Grinder';
      case 'Oven':
        return t('kitchenApplianceOven') || 'Oven';
      case 'IceMaker':
        return t('kitchenApplianceIceMaker') || 'Ice Maker';
      case 'WaterDispenser':
        return t('kitchenApplianceWaterDispenser') || 'Water Dispenser';
      case 'FoodDehydrator':
        return t('kitchenApplianceFoodDehydrator') || 'Food Dehydrator';
      case 'Steamer':
        return t('kitchenApplianceSteamer') || 'Steamer';
      case 'Grill':
        return t('kitchenApplianceGrill') || 'Grill';
      case 'SandwichMaker':
        return t('kitchenApplianceSandwichMaker') || 'Sandwich Maker';
      case 'Waffle_Iron':
        return t('kitchenApplianceWaffleIron') || 'Waffle Iron';
      case 'Deep_Fryer':
        return t('kitchenApplianceDeepFryer') || 'Deep Fryer';
      case 'Bread_Maker':
        return t('kitchenApplianceBreadMaker') || 'Bread Maker';
      case 'Yogurt_Maker':
        return t('kitchenApplianceYogurtMaker') || 'Yogurt Maker';
      case 'Ice_Cream_Maker':
        return t('kitchenApplianceIceCreamMaker') || 'Ice Cream Maker';
      case 'Pasta_Maker':
        return t('kitchenAppliancePastaMaker') || 'Pasta Maker';
      case 'Meat_Grinder':
        return t('kitchenApplianceMeatGrinder') || 'Meat Grinder';
      case 'Can_Opener':
        return t('kitchenApplianceCanOpener') || 'Can Opener';
      case 'Knife_Sharpener':
        return t('kitchenApplianceKnifeSharpener') || 'Knife Sharpener';
      case 'Scale':
        return t('kitchenApplianceScale') || 'Scale';
      case 'Timer':
        return t('kitchenApplianceTimer') || 'Timer';
      default:
        return appliance;
    }
  }

  static localizeWhiteGood(whiteGood: string, t: TranslationFunction): string {
    switch (whiteGood) {
      case 'Refrigerator':
        return t('whiteGoodRefrigerator') || 'Refrigerator';
      case 'WashingMachine':
        return t('whiteGoodWashingMachine') || 'Washing Machine';
      case 'Dishwasher':
        return t('whiteGoodDishwasher') || 'Dishwasher';
      case 'Dryer':
        return t('whiteGoodDryer') || 'Dryer';
      case 'Freezer':
        return t('whiteGoodFreezer') || 'Freezer';
      default:
        return whiteGood;
    }
  }

  /**
   * Formats color display with localized color names and quantities
   */
  static formatColorDisplay(selectedColorImages: Record<string, Record<string, unknown>>, t: TranslationFunction): string {
    if (!selectedColorImages || Object.keys(selectedColorImages).length === 0) return '';
    
    const colorDisplays: string[] = [];
    
    Object.entries(selectedColorImages).forEach(([colorName, data]) => {
      const localizedColorName = this.localizeColorName(colorName, t);
      
      // Extract quantity from the data map
      const quantityValue = data?.quantity;
      
      if (typeof quantityValue === 'number' && quantityValue > 0) {
        colorDisplays.push(`${localizedColorName}: ${quantityValue}`);
      } else if (quantityValue !== undefined && quantityValue !== null) {
        // Handle case where quantity might be a string
        const intQuantity = parseInt(quantityValue.toString(), 10);
        if (!isNaN(intQuantity) && intQuantity > 0) {
          colorDisplays.push(`${localizedColorName}: ${intQuantity}`);
        } else {
          colorDisplays.push(localizedColorName);
        }
      } else {
        colorDisplays.push(localizedColorName);
      }
    });
    
    return colorDisplays.join(', ');
  }

  static localizeColorName(colorName: string, t: TranslationFunction): string {
    switch (colorName) {
      case 'Blue':
        return t('colorBlue') || 'Blue';
      case 'Orange':
        return t('colorOrange') || 'Orange';
      case 'Yellow':
        return t('colorYellow') || 'Yellow';
      case 'Black':
        return t('colorBlack') || 'Black';
      case 'Brown':
        return t('colorBrown') || 'Brown';
      case 'Dark Blue':
        return t('colorDarkBlue') || 'Dark Blue';
      case 'Gray':
        return t('colorGray') || 'Gray';
      case 'Pink':
        return t('colorPink') || 'Pink';
      case 'Red':
        return t('colorRed') || 'Red';
      case 'White':
        return t('colorWhite') || 'White';
      case 'Green':
        return t('colorGreen') || 'Green';
      case 'Purple':
        return t('colorPurple') || 'Purple';
      case 'Teal':
        return t('colorTeal') || 'Teal';
      case 'Lime':
        return t('colorLime') || 'Lime';
      case 'Cyan':
        return t('colorCyan') || 'Cyan';
      case 'Magenta':
        return t('colorMagenta') || 'Magenta';
      case 'Indigo':
        return t('colorIndigo') || 'Indigo';
      case 'Amber':
        return t('colorAmber') || 'Amber';
      case 'Deep Orange':
        return t('colorDeepOrange') || 'Deep Orange';
      case 'Light Blue':
        return t('colorLightBlue') || 'Light Blue';
      case 'Deep Purple':
        return t('colorDeepPurple') || 'Deep Purple';
      case 'Light Green':
        return t('colorLightGreen') || 'Light Green';
      case 'Dark Gray':
        return t('colorDarkGray') || 'Dark Gray';
      case 'Beige':
        return t('colorBeige') || 'Beige';
      case 'Turquoise':
        return t('colorTurquoise') || 'Turquoise';
      case 'Violet':
        return t('colorViolet') || 'Violet';
      case 'Olive':
        return t('colorOlive') || 'Olive';
      case 'Maroon':
        return t('colorMaroon') || 'Maroon';
      case 'Navy':
        return t('colorNavy') || 'Navy';
      case 'Silver':
        return t('colorSilver') || 'Silver';
      default:
        return colorName; // Fallback to English name
    }
  }
}