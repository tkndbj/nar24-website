import { ProductProvider } from "@/context/ProductContext";

export default function ProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProductProvider>{children}</ProductProvider>;
}
