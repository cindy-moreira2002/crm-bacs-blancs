// CSS de marque du dossier de correction — partagé entre l'écran (édition) et le PDF.
export const DOSSIER_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Anton&family=Dancing+Script:wght@700&display=swap');
  .dossier{ --navy:#1E293B; --orange:#F97316; --orange-d:#C2410C; --purple:#581C87;
    --gold:#D97706; --cream:#FFF7ED; --alt:#F8FAFC; --track:#E8EBF0; --ink:#1E293B; --grey:#64748B; --line:#E8EBF0;
    font-family:'Helvetica Neue',Arial,sans-serif; color:var(--ink); font-size:13px; line-height:1.55; }
  .dossier *{ box-sizing:border-box; }
  .dossier .page{ background:#fff; width:190mm; margin:0 auto 10mm; padding:0 0 22mm; position:relative;
    box-shadow:0 2px 14px rgba(0,0,0,.08); border-radius:4px; overflow:hidden; }
  .dossier .logo{ display:inline-flex; align-items:baseline; gap:.16em; line-height:1; }
  .dossier .logo .l-les,.dossier .logo .l-du{ font-family:'Dancing Script',cursive; }
  .dossier .logo .l-mat,.dossier .logo .l-bac{ font-family:'Anton',sans-serif; letter-spacing:.5px; }
  .dossier .logo.light .l-les,.dossier .logo.light .l-du{ color:#FBBF6B; font-size:17px; }
  .dossier .logo.light .l-mat{ color:#fff; font-size:20px; } .dossier .logo.light .l-bac{ color:#fff; font-size:23px; }
  .dossier .logo.dark .l-les,.dossier .logo.dark .l-du{ color:var(--gold); font-size:12px; }
  .dossier .logo.dark .l-mat{ color:var(--navy); font-size:13px; } .dossier .logo.dark .l-bac{ color:var(--navy); font-size:15px; }
  .dossier .topband{ background:var(--navy); height:14mm; border-bottom:3px solid var(--orange); }
  .dossier .footer{ position:absolute; bottom:0; left:0; right:0; }
  .dossier .footer .bar{ height:8mm; background:var(--navy); }
  .dossier .footer .meta{ font-size:10px; color:var(--grey); padding:5px 16mm; display:flex; justify-content:space-between; align-items:center; }
  .dossier .wrap{ padding:0 16mm; }
  .dossier .cover-band{ background:var(--navy); color:#fff; text-align:center; padding:9mm 0; border-bottom:3px solid var(--orange); }
  .dossier .cover-band .logo{ margin-bottom:7mm; }
  .dossier .cover-band h1{ margin:0; font-size:29px; letter-spacing:2px; }
  .dossier .cover-band .sub{ font-size:12px; letter-spacing:2px; color:#FBBF6B; margin-top:6px; }
  .dossier .eleve{ text-align:center; color:var(--purple); font-size:30px; font-weight:700; margin:20mm 0 4px; }
  .dossier .sujet{ text-align:center; font-size:15px; } .dossier .sujet small{ display:block; color:var(--grey); font-size:12px; margin-top:2px; }
  .dossier .notebox{ display:flex; width:78mm; margin:14mm auto 0; border-radius:6px; overflow:hidden; box-shadow:0 4px 14px rgba(249,115,22,.3); }
  .dossier .notebox .val{ background:var(--orange); color:#fff; flex:1; text-align:center; font-size:44px; font-weight:800; padding:10px 0; }
  .dossier .notebox .max{ background:var(--orange-d); color:#fff; width:34mm; display:flex; align-items:center; justify-content:center; font-size:18px; }
  .dossier .sec{ display:flex; align-items:stretch; margin:0 0 14px; border-radius:6px; overflow:hidden; }
  .dossier .sec .num{ background:var(--purple); color:#fff; width:34px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; }
  .dossier .sec .ttl{ background:var(--navy); color:#fff; flex:1; padding:9px 14px; font-size:14px; letter-spacing:1.5px; font-weight:600; text-transform:uppercase; }
  .dossier h3.subh{ color:var(--purple); font-size:15px; margin:18px 0 8px; }
  .dossier p{ text-align:justify; margin:0 0 10px; }
  .dossier table{ width:100%; border-collapse:collapse; margin:6px 0 12px; font-size:12px; border-radius:6px; overflow:hidden; }
  .dossier th{ background:var(--navy); color:#fff; text-align:left; padding:7px 10px; }
  .dossier td{ padding:7px 10px; border-bottom:1px solid var(--line); }
  .dossier tr:nth-child(even) td{ background:var(--alt); }
  .dossier tr.total td{ background:var(--cream); color:var(--orange-d); font-weight:700; }
  .dossier .center{ text-align:center; } .dossier .note-c{ color:var(--orange-d); font-weight:700; font-size:15px; text-align:center; }
  .dossier .bar-track{ background:var(--track); border-radius:6px; height:11px; width:100%; }
  .dossier .bar-fill{ background:var(--orange); border-radius:6px; height:11px; }
  .dossier .cols{ display:flex; gap:10px; }
  .dossier .col{ flex:1; border-radius:8px; padding:12px 14px; }
  .dossier .col.bad{ background:#FEF2F2; border:1px solid #FCD9D9; } .dossier .col.good{ background:#ECFDF3; border:1px solid #CDEAD6; }
  .dossier .col h4{ margin:0 0 8px; font-size:13px; } .dossier .col.bad h4{ color:#C2410C; } .dossier .col.good h4{ color:#15803D; }
  .dossier .callout{ border-left:4px solid var(--orange); background:var(--cream); padding:10px 14px; border-radius:0 8px 8px 0; margin:8px 0 12px; font-size:12.5px; }
  .dossier .callout .add{ color:#15803D; font-weight:600; }
  .dossier ul{ margin:6px 0 12px; padding-left:18px; } .dossier li{ margin-bottom:5px; }
  .dossier .pill{ display:inline-block; background:var(--purple); color:#fff; border-radius:20px; padding:2px 10px; font-size:11px; }
`;

// CSS adapté à l'impression PDF (Chrome) : marges A4 + sauts de page.
export const DOSSIER_PRINT_CSS = `
  @page{ size:A4; margin:0; }
  body{ margin:0; background:#fff; }
  .dossier .page{ width:210mm; min-height:297mm; margin:0; box-shadow:none; border-radius:0; page-break-after:always; }
  .dossier .page:last-child{ page-break-after:auto; }
`;

// Construit le document HTML complet pour le rendu PDF.
export function dossierDocument(bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>${DOSSIER_CSS}${DOSSIER_PRINT_CSS}</style></head>
<body><div class="dossier">${bodyHtml}</div></body></html>`;
}
