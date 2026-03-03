/**
 * FoodAddress.ts
 *
 * Typed model for food delivery addresses.
 * Mirrors Flutter's FoodAddress model (lib/models/food_address.dart).
 *
 * Factories:
 *   FoodAddress.fromMap(map)  — parse from Firestore document data
 *   .toMap()                  — serialize back to Firestore-ready object
 *   .displayLabel             — "MainRegion > City > AddressLine1"
 */

export interface FoodAddressLocation {
  latitude: number;
  longitude: number;
}

export class FoodAddress {
  readonly addressId?: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly city: string;
  readonly mainRegion: string;
  readonly phoneNumber?: string;
  readonly location?: FoodAddressLocation;

  constructor(params: {
    addressId?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    mainRegion: string;
    phoneNumber?: string;
    location?: FoodAddressLocation;
  }) {
    this.addressId = params.addressId;
    this.addressLine1 = params.addressLine1;
    this.addressLine2 = params.addressLine2;
    this.city = params.city;
    this.mainRegion = params.mainRegion;
    this.phoneNumber = params.phoneNumber;
    this.location = params.location;
  }

  // ── Factory ──────────────────────────────────────────────────────────────────

  static fromMap(map: Record<string, unknown>): FoodAddress {
    let loc: FoodAddressLocation | undefined;
    const l = map["location"];
    if (l && typeof l === "object" && "latitude" in l && "longitude" in l) {
      loc = {
        latitude: Number((l as Record<string, unknown>)["latitude"]),
        longitude: Number((l as Record<string, unknown>)["longitude"]),
      };
    }

    return new FoodAddress({
      addressId: (map["addressId"] as string) ?? undefined,
      addressLine1: (map["addressLine1"] as string) ?? "",
      addressLine2: (map["addressLine2"] as string) ?? undefined,
      city: (map["city"] as string) ?? "",
      mainRegion: (map["mainRegion"] as string) ?? "",
      phoneNumber: (map["phoneNumber"] as string) ?? undefined,
      location: loc,
    });
  }

  // ── Serialization ────────────────────────────────────────────────────────────

  toMap(): Record<string, unknown> {
    const map: Record<string, unknown> = {
      addressLine1: this.addressLine1,
      city: this.city,
      mainRegion: this.mainRegion,
    };
    if (this.addressId != null) map["addressId"] = this.addressId;
    if (this.addressLine2 != null) map["addressLine2"] = this.addressLine2;
    if (this.phoneNumber != null) map["phoneNumber"] = this.phoneNumber;
    if (this.location != null) map["location"] = this.location;
    return map;
  }

  // ── Display ──────────────────────────────────────────────────────────────────

  /** Short display label: "MainRegion > City > AddressLine1" */
  get displayLabel(): string {
    return [this.mainRegion, this.city, this.addressLine1]
      .filter((s) => s.length > 0)
      .join(" > ");
  }

  toString(): string {
    return `FoodAddress(city: ${this.city}, mainRegion: ${this.mainRegion})`;
  }

  // ── Equality ─────────────────────────────────────────────────────────────────

  equals(other: FoodAddress): boolean {
    return (
      this.addressId === other.addressId &&
      this.city === other.city &&
      this.mainRegion === other.mainRegion
    );
  }
}
