import { SELLER } from "@/lib/seller";
import { Link } from "@tanstack/react-router";

export function SellerDetails() {
  return (
    <section aria-labelledby="seller-title" className="border-t pt-6">
      <h2 id="seller-title" className="text-lg font-semibold">Identificação do vendedor</h2>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-muted-foreground">Razão social</dt><dd className="mt-1 font-medium">{SELLER.legalName}</dd></div>
        <div><dt className="text-muted-foreground">CNPJ</dt><dd className="mt-1 font-medium">{SELLER.cnpj}</dd></div>
        <div className="min-w-0 sm:col-span-2"><dt className="text-muted-foreground">Contato de privacidade</dt><dd className="mt-1"><a className="break-all font-medium text-primary underline underline-offset-4" href={`mailto:${SELLER.privacyEmail}`}>{SELLER.privacyEmail}</a></dd></div>
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">Leia a <Link to="/politica-de-privacidade" className="text-primary underline underline-offset-4">Política de Privacidade</Link>. Os termos de contratação aguardam revisão antes da abertura das vendas.</p>
    </section>
  );
}
