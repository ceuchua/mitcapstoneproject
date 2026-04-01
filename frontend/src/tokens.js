// tokens.js — shared design tokens

export const T = {
  bg:         "#F7F4EF",
  surface:    "#FFFFFF",
  border:     "#E4DDD3",
  ink:        "#1A1714",
  inkMuted:   "#7A7168",
  accent:     "#C8520A",
  accentSoft: "#F5E8DE",
  green:      "#2D7A4F",
  greenSoft:  "#DFF0E8",
  red:        "#B53A2F",
  redSoft:    "#FAE5E3",
  yellow:     "#B07D1A",
  yellowSoft: "#FBF2DC",
  sidebar:    "#1A1714",
};

export const globalCss = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; color: ${T.ink}; font-family: 'DM Sans', sans-serif; font-size: 14px; }
  h1,h2,h3,h4 { font-family: 'DM Serif Display', serif; font-weight: 400; }

  .app { display: flex; min-height: 100vh; }
  .main { flex: 1; padding: 32px 36px; overflow-x: hidden; max-width: 1200px; }
  .page-title { font-size: 28px; margin-bottom: 4px; }
  .page-sub { color: ${T.inkMuted}; margin-bottom: 28px; font-size: 13px; }

  .card { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 14px; padding: 22px 24px; }
  .card-title { font-family: 'DM Serif Display', serif; font-size: 17px; margin-bottom: 16px; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }

  .stat-tile { background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 12px; padding: 18px 20px; }
  .stat-value { font-size: 32px; font-family: 'DM Serif Display', serif; line-height: 1; }
  .stat-label { font-size: 12px; color: ${T.inkMuted}; margin-top: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: .5px; }

  .form-group { margin-bottom: 14px; }
  .form-label { display: block; font-size: 12px; font-weight: 600; color: ${T.inkMuted}; margin-bottom: 5px; text-transform: uppercase; letter-spacing: .5px; }
  .form-input, .form-select, .form-textarea {
    width: 100%; padding: 9px 12px; border: 1px solid ${T.border};
    border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 13px;
    background: ${T.bg}; color: ${T.ink}; transition: border-color .15s; outline: none;
  }
  .form-input:focus, .form-select:focus, .form-textarea:focus { border-color: ${T.accent}; background: #fff; }
  .form-textarea { resize: vertical; min-height: 90px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; font-family: 'DM Sans', sans-serif; transition: all .15s; }
  .btn-primary { background: ${T.accent}; color: #fff; }
  .btn-primary:hover { background: #a84208; }
  .btn-primary:disabled { background: #c9b8ae; cursor: not-allowed; }
  .btn-secondary { background: transparent; color: ${T.ink}; border: 1px solid ${T.border}; }
  .btn-secondary:hover { background: ${T.bg}; }
  .btn-danger { background: transparent; color: ${T.red}; border: 1px solid ${T.red}; }
  .btn-danger:hover { background: ${T.redSoft}; }
  .btn-sm { padding: 6px 12px; font-size: 12px; }

  .pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .pill-gap     { background: ${T.redSoft};    color: ${T.red}; }
  .pill-match   { background: ${T.greenSoft};  color: ${T.green}; }
  .pill-surplus { background: ${T.yellowSoft}; color: ${T.yellow}; }
  .pill-topic   { background: ${T.accentSoft}; color: ${T.accent}; }
  .pill-neutral { background: #EEEAE5; color: ${T.inkMuted}; }

  .score-bar-wrap { background: #EDE9E3; border-radius: 20px; height: 8px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 20px; transition: width .6s cubic-bezier(.4,0,.2,1); }

  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th { text-align: left; font-size: 11px; font-weight: 600; color: ${T.inkMuted}; text-transform: uppercase; letter-spacing: .5px; padding: 8px 12px; border-bottom: 1px solid ${T.border}; }
  .table td { padding: 11px 12px; border-bottom: 1px solid ${T.border}; vertical-align: middle; }
  .table tr:last-child td { border-bottom: none; }
  .table tr:hover td { background: ${T.bg}; }

  .alert { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 14px; }
  .alert-error   { background: ${T.redSoft};   color: ${T.red};   border: 1px solid #f5c6c3; }
  .alert-success { background: ${T.greenSoft}; color: ${T.green}; border: 1px solid #b8e0cc; }

  .divider { border: none; border-top: 1px solid ${T.border}; margin: 20px 0; }
  .empty { text-align: center; padding: 40px; color: ${T.inkMuted}; }
  .empty-icon { font-size: 32px; margin-bottom: 8px; }
  .section { margin-bottom: 24px; }

  .tabs { display: flex; gap: 0; border-bottom: 1px solid ${T.border}; margin-bottom: 22px; }
  .tab { padding: 9px 18px; font-size: 13px; font-weight: 500; cursor: pointer; color: ${T.inkMuted}; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all .15s; user-select: none; }
  .tab.active { color: ${T.accent}; border-bottom-color: ${T.accent}; }
  .tab:hover:not(.active) { color: ${T.ink}; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; }
  .spinner-dark { border-color: rgba(0,0,0,.15); border-top-color: ${T.accent}; }

  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
  .fade-up { animation: fadeUp .3s ease both; }

  @media (max-width: 900px) {
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    .form-row, .form-row-3 { grid-template-columns: 1fr; }
  }
`;
