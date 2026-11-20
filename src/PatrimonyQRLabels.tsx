import { useState } from "react";
import { QrCode, Printer, X } from "lucide-react";

export type PatrimonyQRAsset = {
  id: string;
  asset_name: string;
  category: string;
  tombamento: string;
  current_location: string;
};

export default function PatrimonyQRLabels({
  assets,
  selectedAsset,
  onClearSelected,
}: {
  assets: PatrimonyQRAsset[];
  selectedAsset?: PatrimonyQRAsset | null;
  onClearSelected?: () => void;
}) {
  const [batch, setBatch] = useState(false);
  const list = batch ? assets : selectedAsset ? [selectedAsset] : [];
  const close = () => {
    setBatch(false);
    onClearSelected?.();
  };
  const qrValue = (asset: PatrimonyQRAsset) =>
    `PROERD-DIGITAL-PATRIMONIO:${asset.id}:${asset.tombamento}`;

  return (
    <>
      <button type="button" className="patrimony-btn secondary" onClick={() => setBatch(true)}>
        <QrCode size={16} /> Etiquetas em lote
      </button>
      {(selectedAsset || batch) && (
        <div className="pqr-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="pqr-dialog" role="dialog" aria-modal="true">
            <header>
              <h3>{batch ? "Etiquetas patrimoniais" : "Etiqueta QR do patrimônio"}</h3>
              <button type="button" aria-label="Fechar" onClick={close}><X size={18} /></button>
            </header>
            <div className="pqr-preview">
              {list.map((asset) => (
                <article className="pqr-label" key={asset.id}>
                  <img alt={`QR Code ${asset.tombamento}`} src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=4&data=${encodeURIComponent(qrValue(asset))}`} />
                  <div>
                    <strong>{asset.asset_name}</strong>
                    <span>Tombamento: {asset.tombamento}</span>
                    <small>{asset.category}</small>
                    <small>Local: {asset.current_location}</small>
                  </div>
                </article>
              ))}
            </div>
            <footer>
              <button type="button" onClick={close}>Fechar</button>
              <button type="button" className="pqr-print" onClick={() => window.print()}><Printer size={16} /> Imprimir etiquetas</button>
            </footer>
          </section>
        </div>
      )}
      <style>{`
        .pqr-backdrop{position:fixed;z-index:9999;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:18px}
        .pqr-dialog{width:min(920px,96vw);max-height:90vh;overflow:hidden;background:#fff;color:#172033;border-radius:12px;display:flex;flex-direction:column}
        .pqr-dialog header,.pqr-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e5e7eb}
        .pqr-dialog footer{border-top:1px solid #e5e7eb;border-bottom:0;justify-content:flex-end}
        .pqr-preview{padding:16px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
        .pqr-label{display:flex;align-items:center;gap:12px;border:1px solid #d1d5db;padding:10px;break-inside:avoid;background:#fff;color:#111}
        .pqr-label img{width:112px;height:112px;object-fit:contain}.pqr-label div{display:flex;flex-direction:column;gap:5px}
        .pqr-label span{font-size:12px}.pqr-label small{font-size:11px;color:#555}
        @media print{body *{visibility:hidden!important}.pqr-preview,.pqr-preview *{visibility:visible!important}.pqr-preview{position:absolute;inset:0;overflow:visible;padding:5mm;display:grid;grid-template-columns:repeat(2,1fr);gap:5mm}.pqr-label{width:90mm;height:45mm;box-sizing:border-box;border:1px solid #222;padding:3mm}.pqr-label img{width:35mm;height:35mm}}
      `}</style>
    </>
  );
}
