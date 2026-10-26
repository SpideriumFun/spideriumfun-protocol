"""Asset prep: premultiplied resize of the transparent logo (its transparent
region is pure black RGB, so straight-alpha resampling would leave dark fringes),
banner copy, and the 32x32 favicon traced from the real pixel grid."""
import numpy as np, re, shutil, sys
from PIL import Image
LOGO='brand/LOGO SPIDERIUM PNG...png'
BANNER='reference/SAMPUL SPIDERIUM JPG.jpg.jpeg'
OUT='src/assets/'
im=Image.open(LOGO).convert('RGBA')
a=np.array(im)[...,3]
ys,xs=np.nonzero(a>8)
box=(int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1)
print('alpha bbox',box)
def premul_resize(img,size):
    p=img.convert('RGBa').resize(size,Image.LANCZOS)
    return p.convert('RGBA')
for n in (128,512,1024):
    premul_resize(im,(n,n)).save(f'{OUT}logo-{n}.png',optimize=True)
premul_resize(im,(180,180)).save(f'{OUT}apple-touch-icon.png',optimize=True)
Image.open(BANNER).convert('RGB').save(OUT+'banner.jpg',quality=84,optimize=True,progressive=True)

# ---- favicon: crop to subject bbox (square), premultiplied downsample to 32x32,
# snap each lit cell to the nearest real palette pixel, merge horizontal runs.
cx=(box[0]+box[2])/2;cy=(box[1]+box[3])/2;s=max(box[2]-box[0],box[3]-box[1])*1.04
sq=(int(cx-s/2),int(cy-s/2),int(cx+s/2),int(cy+s/2))
crop=im.crop(sq)
g=crop.convert('RGBa').resize((32,32),Image.BOX)
ga=np.array(g.convert('RGBA'))
tok=open('src/tokens.css',encoding='utf8').read()
pal=[tuple(int(h[i:i+2],16) for i in (0,2,4)) for h in re.findall(r'--c-(?:silk|text|uv2|uv|uv-mid|uv-deep|uv-dim|mute|dim)\s*:\s*#([0-9a-fA-F]{6})',tok)]
bg=re.search(r'--c-bg\s*:\s*#([0-9a-fA-F]{6})',tok).group(1)
def near(c):
    return min(pal,key=lambda p:sum((p[i]-c[i])**2 for i in range(3)))
rects=[]
for y in range(32):
    x=0
    while x<32:
        al=ga[y,x,3]
        if al<56: x+=1;continue
        col=near(tuple(int(v) for v in ga[y,x,:3]));x0=x
        while x<32 and ga[y,x,3]>=56 and near(tuple(int(v) for v in ga[y,x,:3]))==col: x+=1
        rects.append((x0,y,x-x0,'#%02x%02x%02x'%col))
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">',
     f'<rect width="32" height="32" rx="6" fill="#{bg}"/>']
for x,y,w,c in rects: svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="1" fill="{c}"/>')
svg.append('</svg>')
txt='\n'.join(svg)
assert '<!--' not in txt
open(OUT+'favicon.svg','w',encoding='utf8').write(txt)
print('favicon rects',len(rects),'bytes',len(txt))
