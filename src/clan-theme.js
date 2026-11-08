// El negativo cambia las superficies y la tinta; las fotos y las insignias
// conservan su imagen original.
export const clanThemeClass = clan => clan === 'vxltm' ? ' negative' : '';
export const admissionDesignVersion = clan => clan === 'vxltm' ? 5 : 3;
export const clanNegativeCSS = `
.canvas.negative{background:#f5f5f0;color:#0b0b0b;border-color:#bdbdb7;--accent:#0b0b0b;--tint:#0b0b0b;color-scheme:light}
.negative header,.negative footer,.negative .motto,.negative .admit-score{border-color:#00000028}
.negative .logo,.negative .brand img{filter:grayscale(1) invert(1);mix-blend-mode:multiply}
.negative .brand small,.negative .serial,.negative .label,.negative .season,.negative .summary,.negative thead,.negative .position,.negative .player small,.negative .subtitle,.negative .admit-label,.negative .admit-score span,.negative .rank-seal small{color:#5c5c56}
.negative .tagline,.negative .story,.negative .requirement,.negative .intro,.negative .admit-id,.negative .empty{color:#41413d}
.negative .requirement,.negative .cell{background:#00000004}
.negative .requirement b,.negative .summary b,.negative .notice b{color:#0b0b0b}
.negative .community{background:#0b0b0b;color:#f5f5f0}
.negative footer,.negative .rank-seal{background:#f5f5f0;color:#41413d}
.negative th,.negative td,.negative .cell,.negative .rank-seal{border-color:#00000026}
.negative tr.first{background:#00000008}
.negative .ghost{-webkit-text-stroke-color:#00000016}
.negative .portrait-inner{background:#e5e5df}
.negative .portrait-fallback{color:#0b0b0b}
.negative .notice{background:#00000006;color:#0b0b0b}
.negative.canvas::before{border-color:#00000008}
.negative header{position:relative;padding-right:156px}
.negative header::after{content:'';position:absolute;right:34px;top:50%;transform:translateY(-50%);width:86px;height:32px;background:repeating-linear-gradient(113deg,transparent 0 13px,#df263c 13px 25px,transparent 25px 32px)}
.negative .line{background:repeating-linear-gradient(113deg,#0b0b0b 0 44px,#df263c 44px 58px,#0b0b0b 58px 78px)}
@media(max-width:600px){.negative header{padding-right:94px}.negative header::after{right:20px;width:50px;height:25px}.negative .brand{font-size:22px}.negative .brand img,.negative .logo{width:42px;height:42px}.negative .eyebrow,.negative .serial{letter-spacing:1px;font-size:9px}}
`;
