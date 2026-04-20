type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");
}
