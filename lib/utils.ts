import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBigIntegerToHexString(bigInteger: any) {
  var hex = bigInteger.toString(16);
  // Ensure even number of characters
  if (hex.length % 2 !== 0) {
    hex = "0" + hex;
  }
  return hex;
};