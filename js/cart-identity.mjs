/** Identidade estável do produto no carrinho. */
export function cartProductKey(product) {
  const publicId = String(product?.public_id || product?.produtoId || "").trim();
  if (publicId) return "public:" + publicId;
  return [
    "legacy",
    String(product?.brand || ""),
    String(product?.nome || ""),
    String(product?.volume || "")
  ].join("|");
}
