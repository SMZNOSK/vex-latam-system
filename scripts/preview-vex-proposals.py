from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'design' / 'vex-squad'
FONTS = Path.home() / '.codex' / 'skills' / 'canvas-design' / 'canvas-fonts'
OUT.mkdir(parents=True, exist_ok=True)
BLACK, WHITE, GRAY, LINE = '#0b0b0b', '#f5f5f0', '#a9a9a3', '#373735'

def font(size, kind='display'):
    names = {'display':'BigShoulders-Bold.ttf', 'body':'InstrumentSans-Regular.ttf', 'mono':'DMMono-Regular.ttf'}
    return ImageFont.truetype(str(FONTS / names[kind]), size)

def text(im, xy, value, size, color=WHITE, kind='display', maxw=None):
    d = ImageDraw.Draw(im)
    while maxw and d.textlength(value, font=font(size, kind)) > maxw:
        size -= 1
    d.text(xy, value, font=font(size, kind), fill=color, anchor='lt')

logo = Image.open(ROOT / 'rangos' / 'logos' / 'VEX LATAM' / 'WhatsApp Image 2026-10-13 at 3.49.43 PM.jpeg').convert('RGB')
# La misma marca del proyecto, con su área vacía recortada para el encabezado.
logo = logo.crop((280, 375, 1010, 1010))

def brand(im, x, y, light=False):
    mark = ImageOps.fit(logo, (70, 62))
    if light:
        mark = ImageOps.invert(mark)
    im.paste(mark, (x, y))
    text(im, (x+88, y+4), 'VEX LATAM SQUAD', 31, BLACK if light else WHITE)
    text(im, (x+88, y+40), 'THE FINALS / COMUNIDAD', 11, '#555550' if light else GRAY, 'mono')

def panel(style):
    light = style == 'b'
    bg, fg, muted, line = (WHITE, BLACK, '#62625e', '#bdbdb6') if light else (BLACK, WHITE, GRAY, LINE)
    im = Image.new('RGB', (960, 960), bg)
    d = ImageDraw.Draw(im)
    brand(im, 58, 46, light)
    text(im, (738, 54), 'PERFIL / 01', 15, muted, 'mono')
    d.line((58, 138, 902, 138), fill=line, width=2)
    if style == 'a':
        d.polygon([(747,179),(900,179),(780,490),(627,490)], fill=WHITE)
        d.polygon([(839,179),(898,179),(778,490),(719,490)], fill=BLACK)
        d.polygon([(899,179),(902,179),(902,458),(889,490),(827,490)], fill='#696966')
        text(im, (58, 183), 'TU PERFIL.', 129)
        text(im, (58, 319), 'TU EQUIPO.', 129)
        text(im, (61, 491), 'EL SIGUIENTE SQUAD EMPIEZA CONTIGO.', 19, GRAY, 'body')
        d.rectangle((58, 547, 902, 553), fill=WHITE)
    elif style == 'b':
        text(im, (58, 178), 'JUEGA CON', 112, fg)
        text(im, (58, 298), 'LOS TUYOS.', 112, fg)
        text(im, (60, 451), 'TU PERFIL. TU EQUIPO. TU COMUNIDAD.', 19, muted, 'body')
        for j in range(3):
            d.polygon([(754+j*43,420),(779+j*43,420),(756+j*43,494),(731+j*43,494)], fill=fg)
        d.line((58, 547, 902, 547), fill=fg, width=3)
    else:
        d.rectangle((58, 178, 902, 523), outline=line, width=2)
        for x in range(85, 900, 28):
            d.line((x, 191, x, 197), fill=line)
        text(im, (84, 232), 'CONECTA.', 109)
        text(im, (84, 354), 'COMPITE.', 109)
        text(im, (647, 468), 'SQUAD / 03', 17, GRAY, 'mono')
        text(im, (60, 554), 'CONFIGURA TU IDENTIDAD DE JUGADOR.', 19, GRAY, 'body')
    rows = [('01','EMBARK ID + RS'), ('02','CLASE + ESPECIALIZACIONES'), ('03','LISTO PARA JUGAR')]
    for n,(num,label) in enumerate(rows):
        y=609+n*76
        text(im, (61,y), num, 29, muted)
        text(im, (120,y+2), label, 28, fg)
        d.line((58,y+53,902,y+53), fill=line)
    text(im, (58, 892), 'NO SOMOS SOLO JUGADORES, SOMOS VEX.', 16, fg, 'body')
    text(im, (787, 893), 'VEX / LATAM', 13, muted, 'mono')
    return im

def welcome(style):
    light = style=='b'
    bg,fg,muted,line=(WHITE,BLACK,'#62625e','#bdbdb6') if light else (BLACK,WHITE,GRAY,LINE)
    im=Image.new('RGB',(960,360),bg); d=ImageDraw.Draw(im)
    d.rectangle((1,1,958,358),outline=line,width=2)
    text(im,(38,30),'NUEVO INTEGRANTE / VXTG',15,muted,'mono')
    text(im,(38,76),'BIENVENIDO, VEXINK.',69,fg,maxw=670)
    text(im,(40,171),'Vexink#1234',25,muted,'body')
    d.line((40,225,648,225),fill=line,width=2)
    text(im,(40,249),'33,400',60,fg)
    text(im,(214,282),'RS  /  PLATINO 3',19,muted,'mono')
    d.rectangle((719,67,912,260),fill=fg)
    d.rectangle((731,79,900,248),fill=bg)
    text(im,(773,123),'VX',80,fg)
    text(im,(727,278),'AVATAR DISCORD',13,muted,'mono')
    return im

board=Image.new('RGB',(2400,1500),'#e6e6df')
text(board,(80,60),'VEX LATAM SQUAD',70,BLACK)
text(board,(80,145),'DIRECCIÓN VISUAL / ESPORTS 2D / BLANCO + NEGRO',20,'#555550','mono')
text(board,(1720,75),'ESTUDIO / 07 NOV 2026',17,'#555550','mono')
text(board,(1720,109),'MUESTRAS CON DATOS FICTICIOS',15,'#555550','mono')
labels=[('a','01 / CORTE','Negro dominante. Diagonales. Impacto.'),('b','02 / EDICIÓN','Blanco dominante. Contraste editorial.'),('c','03 / SEÑAL','Negro técnico. Retícula. Precisión.')]
for n,(style,name,caption) in enumerate(labels):
    x=80+n*760
    text(board,(x,225),name,37,BLACK)
    text(board,(x,278),caption,19,'#555550','body')
    card=panel(style); card.save(OUT/f'propuesta-{style}-perfil.png')
    board.paste(card.resize((720,720),Image.Resampling.LANCZOS),(x,330))
    text(board,(x,1080),'BIENVENIDA DEL CLUB',15,'#555550','mono')
    card=welcome(style); card.save(OUT/f'propuesta-{style}-bienvenida.png')
    board.paste(card.resize((720,270),Image.Resampling.LANCZOS),(x,1120))
text(board,(80,1443),'MISMA IDENTIDAD PARA PERFIL, BÚSQUEDA DE EQUIPO Y BIENVENIDAS.',18,'#555550','body')
text(board,(1747,1443),'VEX MONO / PROPUESTAS',16,'#555550','mono')
board.save(OUT/'propuestas.png')
print(OUT/'propuestas.png')
