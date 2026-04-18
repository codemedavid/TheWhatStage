export interface ProductInput {
  name: string;
  price: number;
  description?: string;
  category?: string;
  specs?: Record<string, string>;
}

export function serializeProduct(product: ProductInput): string {
  const { name, price, description, category, specs } = product;

  if (!name.trim()) throw new Error("Product name is required");

  const lines: string[] = [];
  lines.push(`Product: ${name.trim()}`);
  lines.push(`Price: ${price}`);

  if (category) {
    lines.push(`Category: ${category.trim()}`);
  }

  if (description) {
    lines.push(`Description: ${description.trim()}`);
  }

  if (specs && Object.keys(specs).length > 0) {
    lines.push("Specifications:");
    for (const [key, value] of Object.entries(specs)) {
      lines.push(`  ${key}: ${value}`);
    }
  }

  return lines.join("\n");
}
