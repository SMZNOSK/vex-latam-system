// Retrato completo, identidad y RS dominante. La altura depende del contenido.
export const profileCSS=`
.profile-card{container-type:inline-size;padding:24px 26px 14px;border:1px solid #ffffff24;border-top:4px solid var(--accent,#ed243b)}
.profile-card header{min-height:44px;margin:0 0 22px;padding:0 0 16px;border-bottom:1px solid #ffffff30;border-radius:0;background:#0c1016f7;gap:14px}
.profile-card .brand-lockup{gap:8px}.profile-card .vex-mark{width:41px;height:41px}.profile-card .vex-mark img{width:80px;height:80px;left:-18px;top:-20px}
.profile-card .brand-name{font-size:25px;line-height:1}.profile-card .brand-name small{font:8px/1.3 FinalsBody,Arial,sans-serif;letter-spacing:1.4px;margin-top:5px}
.profile-card .finals-lockup{gap:6px;padding:5px 7px;background:#0c1016}.profile-card .finals-lockup .finals-logo{width:36px;height:36px}.profile-card .finals-lockup>span{font-size:21px}
.profile-card .profile-layout{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.5fr);gap:26px;align-items:stretch}
.profile-card .portrait{position:relative;align-self:start;margin:0;width:100%;max-width:none;padding:5px;border:1px solid #ffffff4d;border-radius:0;background:#131922;border-bottom:3px solid var(--accent,#ed243b)}
.profile-card .portrait::before{content:"";position:absolute;left:-1px;top:-1px;width:36px;height:36px;border-top:3px solid var(--accent,#ed243b);border-left:3px solid var(--accent,#ed243b);pointer-events:none}
.profile-card .portrait img{display:block;width:100%;height:auto;border-radius:0;object-fit:contain}
.profile-card .profile-details{min-width:0;display:flex;flex-direction:column;align-items:stretch;background:#0c1016f7;padding:2px 0 0}
.profile-card .profile-heading{margin:0 0 12px;padding:0 0 14px;border-bottom:1px solid #ffffff26}
.profile-card .profile-heading h1{font-size:clamp(29px,5.8cqi,46px);line-height:1.03;letter-spacing:.1px;margin:0;overflow-wrap:anywhere;text-transform:none}
.profile-card .profile-heading .subtitle{font-size:14px;line-height:1.4;margin:8px 0 0}
.profile-card .rank{display:flex;flex-wrap:nowrap;align-items:center;gap:10px;min-width:0;padding:0;margin:0 0 12px;border:0;border-radius:0;background:transparent}
.profile-card .rank-badge{width:57px;height:57px;flex:none}.profile-card .rank-badge-placeholder{width:45px}
.profile-card .rank h2{font-size:29px;line-height:1.1;margin:0;overflow-wrap:anywhere;color:#e3e7ee}
.profile-card .rs-metrics{display:flex;flex-direction:column;gap:0;margin:0 0 17px;min-width:0}
.profile-card .rs-metrics>div{border:0;background:transparent;padding:0;min-width:0}
.profile-card .rs-metrics dt{font:11px/1.3 FinalsBody,Arial,sans-serif;letter-spacing:1.8px;color:#bbc1cb}
.profile-card .rs-metrics dd{font:clamp(52px,11.8cqi,88px)/1 FinalsDisplay,Arial,sans-serif;letter-spacing:-1.5px;font-variant-numeric:tabular-nums;color:#fff;margin:2px 0 8px;overflow-wrap:anywhere}
.profile-card .rs-metrics>div+div{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;padding:0}
.profile-card .rs-metrics>div+div dt{font-size:10px;letter-spacing:1.2px}
.profile-card .rs-metrics>div+div dd{font-size:25px;line-height:1;letter-spacing:0;margin:0;color:#c0c7d2}
.profile-card .loadout{display:grid;grid-template-columns:minmax(85px,.8fr) minmax(0,1.4fr);gap:14px;margin-top:auto;padding-top:14px;border-top:1px solid #ffffff26;min-width:0}
.profile-card .class{display:flex;align-items:flex-start;gap:8px;margin:0;padding:0;background:transparent;border-radius:0;min-width:0}
.profile-card .class>div{min-width:0}.profile-card .class-icon{width:27px;height:29px;flex:none;font-size:22px;border-radius:0;background:var(--accent,#ed243b);margin-top:1px}
.profile-card .class .eyebrow{font-size:9px;line-height:1.2;letter-spacing:1px}.profile-card .class h3{font-size:24px;line-height:1.05;margin:5px 0 0;overflow-wrap:anywhere}
.profile-card .loadout section{min-width:0}.profile-card .loadout section>.eyebrow{display:block;padding:0;background:transparent;font-size:9px;line-height:1.2;letter-spacing:1px;border-radius:0}
.profile-card .skill-frames{gap:6px;margin:8px 0 0}
.profile-card .skill-frame{width:48px;height:48px;flex:none;padding:2px;border:1px solid #ffffff47;border-bottom:2px solid var(--accent,#ed243b);border-radius:0;background:#151c25}.profile-card .skill-frame img{border-radius:0}
.profile-card .chips{margin:8px 0 0}.profile-card .chip{font-size:11px;padding:5px 7px}
.profile-card .sponsor-banner{display:flex;flex-wrap:nowrap;align-items:center;gap:18px;min-height:61px;margin:20px 0 0;padding:10px 18px;border-radius:0;border-width:0;border-left:3px solid var(--accent);clip-path:polygon(0 0,calc(100% - 15px) 0,100% 15px,100% 100%,0 100%)}
.profile-card .sponsor-sign{width:96px;height:39px;flex:none;padding:3px 6px;border-radius:0}
.profile-card .sponsor-caption{min-width:0;padding-left:17px;border-left:1px solid currentColor}
.profile-card .sponsor-caption strong{font-size:25px;line-height:1.1;letter-spacing:.5px;margin:0}
.profile-card footer{background:transparent;gap:12px;margin-top:12px;padding-top:0;border:0;font:8px/1.3 FinalsBody,Arial,sans-serif;letter-spacing:1.4px;color:#b1b7c3}
.profile-card footer>span{background:#0c1016;padding:2px 4px}
.profile-card .profile-layout:not(.has-portrait){grid-template-columns:1fr}
.profile-card .profile-layout:not(.has-portrait) .profile-details{display:grid;grid-template-columns:1fr 1fr;gap:16px 25px;padding:0}
.profile-card .profile-layout:not(.has-portrait) .profile-heading{grid-column:1/-1;margin:0}
.profile-card .profile-layout:not(.has-portrait) .rank{align-self:center;margin:0}
.profile-card .profile-layout:not(.has-portrait) .rs-metrics{margin:0}
.profile-card .profile-layout:not(.has-portrait) .loadout{grid-column:1/-1;margin:0}
@media(max-width:500px){
 .profile-card{padding:16px 16px 12px}.profile-card header{margin-bottom:16px;padding-bottom:12px;gap:10px}
 .profile-card .vex-mark{width:32px;height:32px}.profile-card .vex-mark img{width:64px;height:64px;left:-15px;top:-16px}.profile-card .brand-name{font-size:21px}.profile-card .brand-name small{font-size:6px;letter-spacing:.8px}.profile-card .brand-lockup{gap:6px}
 .profile-card .finals-lockup{padding:3px;gap:4px}.profile-card .finals-lockup .finals-logo{width:27px;height:27px}.profile-card .finals-lockup>span{font-size:17px}
}
@container(max-width:480px){
 .profile-card .profile-layout{grid-template-columns:minmax(0,.82fr) minmax(0,1fr);gap:14px;align-items:start}
 .profile-card .profile-details{display:contents}
 .profile-card .portrait{grid-column:1;grid-row:1 / 4;align-self:start;padding:4px}
 .profile-card .profile-heading{grid-column:2;margin:0;padding:0 0 10px;background:#0c1016}
 .profile-card .profile-heading h1{font-size:clamp(24px,7cqi,32px)}
 .profile-card .rank{grid-column:2;gap:6px;margin:0;background:#0c1016}
 .profile-card .rank-badge{width:37px;height:37px}.profile-card .rank h2{font-size:24px}
 .profile-card .rs-metrics{grid-column:2;margin:0;background:#0c1016}.profile-card .rs-metrics dd{font-size:clamp(42px,14cqi,62px);letter-spacing:-.5px;margin-bottom:8px}.profile-card .rs-metrics dt{font-size:9px;letter-spacing:1px}.profile-card .rs-metrics>div+div{gap:5px}.profile-card .rs-metrics>div+div dt{font-size:8px;letter-spacing:.7px}.profile-card .rs-metrics>div+div dd{font-size:22px}
 .profile-card .loadout{grid-column:1/-1;grid-template-columns:1fr 1.5fr;margin:0;padding:12px 8px 0;background:#0c1016}
 .profile-card .class h3{font-size:24px}.profile-card .skill-frame{width:42px;height:42px}
 .profile-card .sponsor-banner{margin-top:16px;gap:12px;padding:9px 12px;min-height:56px}.profile-card .sponsor-sign{width:66px;height:32px;padding:2px 3px}.profile-card .sponsor-caption{padding-left:12px}.profile-card .sponsor-caption strong{font-size:21px;letter-spacing:0}
 .profile-card .profile-layout:not(.has-portrait) .profile-details{gap:14px}.profile-card .profile-layout:not(.has-portrait) .rank{grid-column:1;grid-row:2}.profile-card .profile-layout:not(.has-portrait) .rs-metrics{grid-column:2;grid-row:2}
}
@container(max-width:310px){
 .profile-card .profile-layout{gap:11px;grid-template-columns:minmax(0,.76fr) minmax(0,1fr)}
 .profile-card .profile-heading h1{font-size:24px}.profile-card .rank h2{font-size:22px}.profile-card .rank-badge{width:31px;height:31px}.profile-card .rs-metrics dd{font-size:42px}
 .profile-card .loadout{gap:10px;grid-template-columns:1fr 1.3fr;padding-left:0;padding-right:0}.profile-card .class h3{font-size:22px}.profile-card .class-icon{width:23px;height:25px}.profile-card .loadout section>.eyebrow{letter-spacing:.5px;font-size:8px}.profile-card .skill-frame{width:38px;height:38px}
 .profile-card .sponsor-caption strong{font-size:19px}.profile-card footer{font-size:7px;letter-spacing:.8px}
}
`;
