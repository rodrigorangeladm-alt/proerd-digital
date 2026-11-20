import { useState } from "react";
import { QrCode, Printer, X } from "lucide-react";

export type PatrimonyQRAsset = {
  id: string;
  asset_name: string;
  category: string;
  tombamento: string;
  current_location: string;
};

/** QR-label modal component. Add it to Patrimony.tsx and pass filtered assets. */
export default function PatrimonyQRLabels({ assets }: { assets: PatrimonyQRAsset[] }) {
  const [single, setSingle] = useState<PatrimonyQRAsset | null>(null);
  const [batch, setBatch] = useState(false);
  const list = batch ? assets : single ? [single] : [];
  const close = () => { setSingle(null); setBatch(false); };
  const qrValue = (a: PatrimonyQRAsset) => `PROERD-DIGITAL-PATRIMONIO:${a.id}:${a.tombamento}`;
  return <>
    <div className="pqr-controls">
      <button type="button" onClick={() => { setSingle(null); setBatch(true); }}><QrCode size={15}/> Etiquetas em lote</button>
    </div>
    {(single || batch) && <div className="pqr-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section className="pqr-dialog" role="dialog" aria-modal="true">
        <header><h3>{batch ? "Etiquetas patrimoniais" : "Etiqueta QR do patrimônio"}</h3><button type="button" aria-label="Fechar" onClick={close}><X size={18}/></button></header>
        <div className="pqr-preview">{list.map(a => <article className="pqr-label" key={a.id}>
          <img alt={`QR Code do tombamento ${a.tombamento}`} src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=4&data=${encodeURIComponent(qrValue(a))}`}/>
          <div><strong>{a.asset_name}</strong><span>Tombamento: {a.tombamento}</span><small>{a.category}</small><small>Local: {a.current_location}</small></div>
        </article>)}</div>
        <footer><button type="button" onClick={close}>Fechar</button><button type="button" className="pqr-print" onClick={() => window.print()}><Printer size={16}/> Imprimir etiquetas</button></footer>
      </section>
    </div>}
    <style>{`
      .pqr-controls button{display:inline-flex;align-items:center;gap:7px;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:white;color:#172033;cursor:pointer}
      .pqr-backdrop{position:fixed;z-index:9999;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:18px}
      .pqr-dialog{width:min(920px,96vw);max-height:90vh;overflow:hidden;background:#fff;color:#172033;border-radius:12px;display:flex;flex-direction:column}
      .pqr-dialog header,.pqr-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e5e7eb}
      .pqr-dialog header h3{margin:0;font-size:18px}.pqr-dialog header button{border:0;background:transparent;cursor:pointer}.pqr-dialog footer{border-top:1px solid #e5e7eb;border-bottom:0;justify-content:flex-end}
      .pqr-dialog footer button{border:1px solid #cbd5e1;border-radius:8px;padding:9px 12px;background:#fff;cursor:pointer}.pqr-dialog footer .pqr-print{background:#1d4ed8;color:#fff;border-color:#1d4ed8;display:inline-flex;align-items:center;gap:7px}
      .pqr-preview{padding:16px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .pqr-label{display:flex;align-items:center;gap:12px;border:1px solid #d1d5db;border-radius:8px;padding:10px;break-inside:avoid;background:#fff;color:#111}
      .pqr-label img{width:112px;height:112px;object-fit:contain}.pqr-label div{display:flex;flex-direction:column;gap:5px}.pqr-label span{font-size:12px}.pqr-label small{font-size:11px;color:#555}
      @media print{body *{visibility:hidden!important}.pqr-preview,.pqr-preview *{visibility:visible!important}.pqr-preview{position:absolute;inset:0;overflow:visible;padding:5mm;display:grid;grid-template-columns:repeat(2,1fr);gap:5mm}.pqr-label{width:90mm;height:45mm;box-sizing:border-box;border:1px solid #222;border-radius:0;padding:3mm}.pqr-label img{width:35mm;height:35mm}.pqr-label strong{font-size:14pt}.pqr-label span,.pqr-label small{font-size:9pt}}
    `}</style>
  </>;
}
